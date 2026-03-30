import Docker from "dockerode";
import { config } from "../config.js";
import path from "node:path";
import fs from "node:fs/promises";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

const CONTAINER_PREFIX = "kraken-sandbox-";
const PROXY_PREFIX = "kraken-proxy-";

function containerName(sessionId: string): string {
  return `${CONTAINER_PREFIX}${sessionId}`;
}

function workspacePath(sessionId: string): string {
  return path.join(config.KRAKEN_WORKSPACES_PATH, sessionId);
}

// ── Port-forward tracking ──────────────────────────────────────────────

interface PortForwardEntry {
  containerPort: number;
  hostPort: number;
  proxyContainerId: string;
}

/** sessionId → active port forwards */
const portForwards = new Map<string, PortForwardEntry[]>();

/** All host ports currently allocated for forwarding */
const allocatedPorts = new Set<number>();

function allocateHostPort(preferred?: number): number {
  if (preferred !== undefined && preferred >= config.KRAKEN_SANDBOX_PORT_RANGE_START
      && preferred <= config.KRAKEN_SANDBOX_PORT_RANGE_END && !allocatedPorts.has(preferred)) {
    allocatedPorts.add(preferred);
    return preferred;
  }
  for (let p = config.KRAKEN_SANDBOX_PORT_RANGE_START; p <= config.KRAKEN_SANDBOX_PORT_RANGE_END; p++) {
    if (!allocatedPorts.has(p)) {
      allocatedPorts.add(p);
      return p;
    }
  }
  throw new Error("No available ports in the configured range");
}

function releaseHostPort(port: number): void {
  allocatedPorts.delete(port);
}

// ── Sandbox network ────────────────────────────────────────────────────

let networkEnsured = false;

async function ensureSandboxNetwork(): Promise<void> {
  if (config.KRAKEN_SANDBOX_NETWORK === "none" || config.KRAKEN_SANDBOX_NETWORK === "bridge") return;
  if (networkEnsured) return;
  try {
    const net = docker.getNetwork(config.KRAKEN_SANDBOX_NETWORK);
    await net.inspect();
  } catch {
    await docker.createNetwork({
      Name: config.KRAKEN_SANDBOX_NETWORK,
      Driver: "bridge",
      Labels: { "kraken.managed": "true" },
    });
  }
  networkEnsured = true;
}

/**
 * Run a quick exec in a container (fire-and-forget, used for init).
 */
async function execQuiet(container: Docker.Container, cmd: string[], user = "root"): Promise<void> {
  const exec = await container.exec({ Cmd: cmd, User: user });
  const stream = await exec.start({});
  await new Promise<void>((resolve) => {
    stream.on("end", resolve);
    stream.on("error", resolve);
    stream.resume(); // drain
  });
}

/**
 * Ensure a sandbox container is running for the given session.
 * Creates the workspace directory and starts a new container if one doesn't exist.
 * Returns the container instance.
 */
export async function ensureSandbox(sessionId: string): Promise<Docker.Container> {
  const name = containerName(sessionId);

  // Check if container already exists
  try {
    const container = docker.getContainer(name);
    const info = await container.inspect();
    if (info.State.Running) {
      return container;
    }
    // Exists but stopped — restart it
    await container.start();
    return container;
  } catch {
    // Container doesn't exist — create it
  }

  // Ensure workspace directory exists on the shared volume (API-side)
  const wsPath = workspacePath(sessionId);
  await fs.mkdir(wsPath, { recursive: true, mode: 0o777 });

  // Ensure network exists (if using a custom network)
  await ensureSandboxNetwork();

  const container = await docker.createContainer({
    name,
    Image: config.KRAKEN_SANDBOX_IMAGE,
    Cmd: ["sleep", "infinity"],
    WorkingDir: `/workspaces/${sessionId}`,
    HostConfig: {
      Memory: config.KRAKEN_SANDBOX_MEMORY_MB * 1024 * 1024,
      MemorySwap: config.KRAKEN_SANDBOX_MEMORY_MB * 1024 * 1024, // no swap
      NetworkMode: config.KRAKEN_SANDBOX_NETWORK,
      Mounts: [
        {
          Type: "volume",
          Source: config.KRAKEN_WORKSPACES_VOLUME,
          Target: "/workspaces",
          ReadOnly: false,
        },
      ],
      PidsLimit: 256,
      ReadonlyRootfs: false,
    },
    Env: [
      ...(config.KRAKEN_GIT_TOKEN ? [`GIT_TOKEN=${config.KRAKEN_GIT_TOKEN}`] : []),
    ],
    User: "sandbox",
    Labels: {
      "kraken.session": sessionId,
      "kraken.managed": "true",
    },
  });

  await container.start();

  // Create session subdirectory with correct ownership inside the sandbox
  await execQuiet(container, ["sh", "-c", `mkdir -p /workspaces/${sessionId} && chown sandbox:sandbox /workspaces/${sessionId}`]);

  return container;
}

/**
 * Execute a command inside the sandbox container.
 * Returns stdout, stderr, and exit code.
 */
export async function execInSandbox(
  sessionId: string,
  command: string[],
  timeoutMs?: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const container = await ensureSandbox(sessionId);
  const timeout = timeoutMs ?? config.KRAKEN_SANDBOX_TIMEOUT_MS;

  const exec = await container.exec({
    Cmd: command,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: `/workspaces/${sessionId}`,
    User: "sandbox",
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Execution timed out after ${timeout}ms`));
    }, timeout);

    exec.start({ hijack: true, stdin: false }, (err, stream) => {
      if (err || !stream) {
        clearTimeout(timer);
        reject(err ?? new Error("Failed to start exec"));
        return;
      }

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      // Docker multiplexes stdout/stderr in a single stream with 8-byte headers
      stream.on("data", (chunk: Buffer) => {
        // Parse docker stream multiplexing
        let offset = 0;
        while (offset < chunk.length) {
          if (offset + 8 > chunk.length) break;
          const streamType = chunk[offset]; // 1=stdout, 2=stderr
          const size = chunk.readUInt32BE(offset + 4);
          offset += 8;
          const payload = chunk.subarray(offset, offset + size);
          offset += size;
          if (streamType === 2) {
            stderrChunks.push(payload);
          } else {
            stdoutChunks.push(payload);
          }
        }
      });

      stream.on("end", async () => {
        clearTimeout(timer);
        try {
          const inspectResult = await exec.inspect();
          resolve({
            stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
            stderr: Buffer.concat(stderrChunks).toString("utf-8"),
            exitCode: inspectResult.ExitCode ?? -1,
          });
        } catch {
          resolve({
            stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
            stderr: Buffer.concat(stderrChunks).toString("utf-8"),
            exitCode: -1,
          });
        }
      });

      stream.on("error", (e: Error) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  });
}

/**
 * Execute Python code in the sandbox.
 */
export async function executeCode(
  sessionId: string,
  code: string,
  timeoutMs?: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return execInSandbox(sessionId, ["python3", "-c", code], timeoutMs);
}

/**
 * Execute a shell command in the sandbox.
 */
export async function shellExec(
  sessionId: string,
  command: string,
  timeoutMs?: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return execInSandbox(sessionId, ["bash", "-c", command], timeoutMs);
}

/**
 * Write a file to the sandbox workspace.
 */
export async function writeFileInSandbox(
  sessionId: string,
  filePath: string,
  content: string,
): Promise<void> {
  // Prevent path traversal
  const normalized = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  if (path.isAbsolute(normalized)) {
    throw new Error("Absolute paths not allowed");
  }
  const base = path.resolve(workspacePath(sessionId));
  const fullPath = path.resolve(base, normalized);
  if (fullPath !== base && !fullPath.startsWith(base + path.sep)) {
    throw new Error("Path traversal detected");
  }
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf-8");
}

/**
 * Read a file from the sandbox workspace.
 */
export async function readFileFromSandbox(
  sessionId: string,
  filePath: string,
): Promise<string> {
  const normalized = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  if (path.isAbsolute(normalized)) {
    throw new Error("Absolute paths not allowed");
  }
  const base = path.resolve(workspacePath(sessionId));
  const fullPath = path.resolve(base, normalized);
  if (fullPath !== base && !fullPath.startsWith(base + path.sep)) {
    throw new Error("Path traversal detected");
  }
  return fs.readFile(fullPath, "utf-8");
}

/**
 * List files in the sandbox workspace.
 */
export async function listFilesInSandbox(
  sessionId: string,
  subdir?: string,
): Promise<Array<{ name: string; type: "file" | "directory"; size: number }>> {
  let targetPath = workspacePath(sessionId);
  if (subdir) {
    const normalized = path.normalize(subdir).replace(/^(\.\.[/\\])+/, "");
    if (path.isAbsolute(normalized)) {
      throw new Error("Absolute paths not allowed");
    }
    const base = path.resolve(workspacePath(sessionId));
    targetPath = path.resolve(base, normalized);
    if (targetPath !== base && !targetPath.startsWith(base + path.sep)) {
      throw new Error("Path traversal detected");
    }
  }

  try {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    const results = await Promise.all(
      entries.map(async (entry) => {
        const stat = await fs.stat(path.join(targetPath, entry.name));
        return {
          name: entry.name,
          type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
          size: stat.size,
        };
      }),
    );
    return results;
  } catch {
    return [];
  }
}

/**
 * Destroy the sandbox container and optionally clean up workspace files.
 * Also tears down any active port forwards for the session.
 */
export async function destroySandbox(
  sessionId: string,
  removeFiles = true,
): Promise<void> {
  // Clean up port forwards first
  await removeAllPortForwards(sessionId);

  const name = containerName(sessionId);
  try {
    const container = docker.getContainer(name);
    try {
      await container.stop({ t: 5 });
    } catch {
      // Already stopped or doesn't exist
    }
    try {
      await container.remove({ force: true });
    } catch {
      // Already removed
    }
  } catch {
    // Container doesn't exist — that's fine
  }

  if (removeFiles) {
    const wsPath = workspacePath(sessionId);
    try {
      await fs.rm(wsPath, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist — that's fine
    }
  }
}

/**
 * Clean up all orphaned sandbox containers (e.g. on startup).
 * Also removes proxy containers and resets port-forward state.
 */
export async function cleanupOrphanedSandboxes(): Promise<number> {
  const containers = await docker.listContainers({
    all: true,
    filters: { label: ["kraken.managed=true"] },
  });

  let cleaned = 0;
  for (const info of containers) {
    try {
      const container = docker.getContainer(info.Id);
      await container.stop({ t: 2 }).catch(() => {});
      await container.remove({ force: true });
      cleaned++;
    } catch {
      // Ignore
    }
  }

  // Reset in-memory port tracking
  portForwards.clear();
  allocatedPorts.clear();

  return cleaned;
}

// ── Port forwarding ────────────────────────────────────────────────────

/**
 * Create a port forward from a host port to a container port inside the sandbox.
 * Spins up a lightweight socat proxy container on the sandbox network.
 */
export async function addPortForward(
  sessionId: string,
  containerPort: number,
  hostPort?: number,
): Promise<{ hostPort: number; containerPort: number }> {
  // Validate port range
  if (containerPort < 1 || containerPort > 65535) {
    throw new Error("containerPort must be between 1 and 65535");
  }

  // Check for duplicate
  const existing = portForwards.get(sessionId);
  if (existing?.some((f) => f.containerPort === containerPort)) {
    const entry = existing.find((f) => f.containerPort === containerPort)!;
    return { hostPort: entry.hostPort, containerPort };
  }

  // Ensure sandbox is running (this also ensures the network exists)
  await ensureSandbox(sessionId);

  const targetHostPort = allocateHostPort(hostPort);
  const sandboxName = containerName(sessionId);
  const proxyName = `${PROXY_PREFIX}${sessionId}-${containerPort}`;

  // Remove stale proxy container if it exists
  try {
    const old = docker.getContainer(proxyName);
    await old.stop({ t: 2 }).catch(() => {});
    await old.remove({ force: true });
  } catch {
    // Doesn't exist — fine
  }

  const proxyContainer = await docker.createContainer({
    name: proxyName,
    Image: "alpine/socat",
    Cmd: [
      `TCP-LISTEN:${containerPort},fork,reuseaddr`,
      `TCP:${sandboxName}:${containerPort}`,
    ],
    ExposedPorts: { [`${containerPort}/tcp`]: {} },
    HostConfig: {
      NetworkMode: config.KRAKEN_SANDBOX_NETWORK,
      PortBindings: {
        [`${containerPort}/tcp`]: [{ HostPort: String(targetHostPort) }],
      },
      Memory: 32 * 1024 * 1024, // 32 MB — proxy is tiny
      PidsLimit: 32,
    },
    Labels: {
      "kraken.session": sessionId,
      "kraken.managed": "true",
      "kraken.proxy": "true",
      "kraken.proxy.containerPort": String(containerPort),
      "kraken.proxy.hostPort": String(targetHostPort),
    },
  });

  await proxyContainer.start();

  if (!portForwards.has(sessionId)) {
    portForwards.set(sessionId, []);
  }
  portForwards.get(sessionId)!.push({
    containerPort,
    hostPort: targetHostPort,
    proxyContainerId: proxyContainer.id,
  });

  return { hostPort: targetHostPort, containerPort };
}

/**
 * Remove a single port forward for a session.
 */
export async function removePortForward(
  sessionId: string,
  containerPort: number,
): Promise<boolean> {
  const forwards = portForwards.get(sessionId);
  if (!forwards) return false;

  const idx = forwards.findIndex((f) => f.containerPort === containerPort);
  if (idx === -1) return false;

  const entry = forwards[idx];
  try {
    const proxy = docker.getContainer(entry.proxyContainerId);
    await proxy.stop({ t: 2 }).catch(() => {});
    await proxy.remove({ force: true });
  } catch {
    // Already gone
  }
  releaseHostPort(entry.hostPort);
  forwards.splice(idx, 1);
  if (forwards.length === 0) portForwards.delete(sessionId);
  return true;
}

/**
 * Remove all port forwards for a session.
 */
async function removeAllPortForwards(sessionId: string): Promise<void> {
  const forwards = portForwards.get(sessionId);
  if (!forwards) return;
  for (const entry of forwards) {
    try {
      const proxy = docker.getContainer(entry.proxyContainerId);
      await proxy.stop({ t: 2 }).catch(() => {});
      await proxy.remove({ force: true });
    } catch {
      // Already gone
    }
    releaseHostPort(entry.hostPort);
  }
  portForwards.delete(sessionId);
}

/**
 * Get current port forwards for a session.
 */
export function getPortForwards(
  sessionId: string,
): Array<{ containerPort: number; hostPort: number }> {
  return (portForwards.get(sessionId) ?? []).map((f) => ({
    containerPort: f.containerPort,
    hostPort: f.hostPort,
  }));
}

// ── Background process execution ───────────────────────────────────────

/**
 * Start a long-running/background command in the sandbox.
 * Returns immediately with the PID of the background process.
 * Output is redirected to a log file that can be read later.
 */
export async function execBackground(
  sessionId: string,
  command: string,
  logFile?: string,
): Promise<{ pid: number; logFile: string }> {
  const log = logFile ?? `/tmp/bg-${Date.now()}.log`;
  // Use nohup + disown to fully detach; echo PID so we can return it.
  const wrappedCmd = `nohup bash -c ${JSON.stringify(command)} > ${log} 2>&1 & echo $!`;
  const result = await execInSandbox(sessionId, ["bash", "-c", wrappedCmd], 10000);
  const pid = parseInt(result.stdout.trim(), 10);
  if (isNaN(pid)) {
    throw new Error(`Failed to start background process: ${result.stderr}`);
  }
  return { pid, logFile: log };
}

/**
 * Read the tail of a background process log file.
 */
export async function readProcessLog(
  sessionId: string,
  logFile: string,
  lines = 100,
): Promise<string> {
  const result = await execInSandbox(
    sessionId,
    ["tail", "-n", String(lines), logFile],
    5000,
  );
  return result.stdout;
}

/**
 * List running processes inside the sandbox.
 */
export async function listProcesses(
  sessionId: string,
): Promise<string> {
  const result = await execInSandbox(
    sessionId,
    ["ps", "aux", "--sort=-pcpu"],
    5000,
  );
  return result.stdout;
}

/**
 * Kill a process in the sandbox by PID.
 */
export async function killProcess(
  sessionId: string,
  pid: number,
  signal = "TERM",
): Promise<{ success: boolean; output: string }> {
  const result = await execInSandbox(
    sessionId,
    ["kill", `-${signal}`, String(pid)],
    5000,
  );
  return { success: result.exitCode === 0, output: result.stderr || result.stdout };
}

// ── Sandbox listing & introspection ────────────────────────────────────

export interface SandboxInfo {
  sessionId: string;
  containerId: string;
  status: string;
  created: string;
  ports: Array<{ containerPort: number; hostPort: number }>;
  memoryLimitMB: number;
  image: string;
}

/**
 * List all running sandbox containers.
 */
export async function listSandboxes(): Promise<SandboxInfo[]> {
  const containers = await docker.listContainers({
    all: true,
    filters: { label: ["kraken.managed=true"] },
  });

  const sandboxes: SandboxInfo[] = [];
  for (const info of containers) {
    // Skip proxy containers
    if (info.Labels["kraken.proxy"] === "true") continue;

    const sid = info.Labels["kraken.session"] ?? "";
    sandboxes.push({
      sessionId: sid,
      containerId: info.Id.slice(0, 12),
      status: info.State,
      created: new Date(info.Created * 1000).toISOString(),
      ports: getPortForwards(sid),
      memoryLimitMB: config.KRAKEN_SANDBOX_MEMORY_MB,
      image: info.Image,
    });
  }
  return sandboxes;
}

/**
 * Get detailed info about a specific sandbox.
 */
export async function getSandboxInfo(sessionId: string): Promise<SandboxInfo | null> {
  const name = containerName(sessionId);
  try {
    const container = docker.getContainer(name);
    const info = await container.inspect();
    return {
      sessionId,
      containerId: info.Id.slice(0, 12),
      status: info.State.Status,
      created: info.Created,
      ports: getPortForwards(sessionId),
      memoryLimitMB: Math.round((info.HostConfig.Memory ?? 0) / 1024 / 1024),
      image: info.Config.Image,
    };
  } catch {
    return null;
  }
}

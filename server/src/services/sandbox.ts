import Docker from "dockerode";
import { config } from "../config.js";
import path from "node:path";
import fs from "node:fs/promises";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

const CONTAINER_PREFIX = "kraken-sandbox-";

function containerName(sessionId: string): string {
  return `${CONTAINER_PREFIX}${sessionId}`;
}

function workspacePath(sessionId: string): string {
  return path.join(config.KRAKEN_WORKSPACES_PATH, sessionId);
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
  const fullPath = path.join(workspacePath(sessionId), normalized);
  // Double-check the resolved path is still inside workspace
  if (!fullPath.startsWith(workspacePath(sessionId))) {
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
  const fullPath = path.join(workspacePath(sessionId), normalized);
  if (!fullPath.startsWith(workspacePath(sessionId))) {
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
    targetPath = path.join(targetPath, normalized);
    if (!targetPath.startsWith(workspacePath(sessionId))) {
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
 */
export async function destroySandbox(
  sessionId: string,
  removeFiles = true,
): Promise<void> {
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
  return cleaned;
}

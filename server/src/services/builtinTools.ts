import { tool } from "ai";
import { z } from "zod";
import path from "node:path";
import { listTools, createTool } from "./tools.js";
import { getRelevantSkills, createSkill } from "./skills.js";
import {
  createSchedule,
  createOneTimeSchedule,
  listSchedules,
  deleteSchedule,
} from "./schedules.js";
import {
  executeCode,
  shellExec,
  writeFileInSandbox,
  writeBinaryInSandbox,
  readFileFromSandbox,
  readBinaryFromSandbox,
  listFilesInSandbox,
  snapshotWorkspaceFiles,
  addPortForward,
  removePortForward,
  execBackground,
  readProcessLog,
  listProcesses,
  killProcess,
  getSandboxInfo,
  updateSandboxResources,
} from "./sandbox.js";
import {
  navigateTo,
  getPageSnapshot,
  screenshotPage,
  clickElement,
  typeText,
  evaluateScript,
  closePage,
} from "./browser.js";
import { storeExplicitMemory, recallMemories } from "./memory.js";
import { getSecretValue } from "./secrets.js";
import { config } from "../config.js";

/**
 * Built-in tools that are always available to the LLM.
 * These are the only tools passed directly — all other tools
 * live in the registry and are discovered via search_tools.
 */
export function getBuiltinTools(sessionId: string) {
  return {
    web_search: tool({
      description:
        "Search the web for current information. Use this proactively when you need facts, API docs, URLs, or anything beyond your training data. Do NOT ask the user for information you can search for yourself.",
      parameters: z.object({
        query: z.string().describe("The search query"),
      }),
      execute: async ({ query }) => {
        try {
          // Try DuckDuckGo Instant Answer API (no key required)
          const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
          const res = await fetch(url, {
            headers: { "User-Agent": "KrakenAgent/1.0" },
            signal: AbortSignal.timeout(10000),
          });
          const data = (await res.json()) as Record<string, unknown>;

          const results: Array<{ title: string; url: string; snippet: string }> = [];

          // Abstract (direct answer)
          if (data.Abstract) {
            results.push({
              title: data.Heading as string || "Direct Answer",
              url: data.AbstractURL as string || "",
              snippet: data.Abstract as string,
            });
          }

          // Related topics
          if (Array.isArray(data.RelatedTopics)) {
            for (const topic of (data.RelatedTopics as Array<Record<string, unknown>>).slice(0, 5)) {
              if (topic.Text && topic.FirstURL) {
                results.push({
                  title: (topic.Text as string).slice(0, 80),
                  url: topic.FirstURL as string,
                  snippet: topic.Text as string,
                });
              }
            }
          }

          if (results.length === 0) {
            return {
              found: 0,
              message: `No instant results for "${query}". Try using fetch_url with a specific URL, or rephrase the query.`,
              suggestion: "Try a more specific query or fetch a known URL directly.",
            };
          }

          return { found: results.length, results };
        } catch (err: any) {
          return { found: 0, error: err.message, message: "Web search failed. Try fetch_url with a direct URL instead." };
        }
      },
    }),

    fetch_url: tool({
      description:
        "Fetch the content of a URL (web page, API endpoint, JSON, etc.). Use this to read API documentation, fetch data from APIs, or inspect web resources. Automatically handles JSON and text responses.",
      parameters: z.object({
        url: z.string().describe("The full URL to fetch (must start with http:// or https://)"),
        method: z.string().describe("HTTP method: GET or POST (default: GET)"),
        body: z.string().describe("Request body for POST requests (JSON string). Use empty string for GET requests."),
      }),
      execute: async ({ url: targetUrl, method, body }) => {
        try {
          const httpMethod = (method || "GET").toUpperCase();
          const headers: Record<string, string> = { "User-Agent": "KrakenAgent/1.0" };
          if (body && body.length > 0) headers["Content-Type"] = "application/json";

          const res = await fetch(targetUrl, {
            method: httpMethod,
            headers,
            body: body && body.length > 0 ? body : undefined,
            signal: AbortSignal.timeout(15000),
          });

          const contentType = res.headers.get("content-type") || "";
          let content: unknown;

          if (contentType.includes("json")) {
            content = await res.json();
          } else {
            const text = await res.text();
            // Truncate very large HTML/text responses to stay within context limits
            content = text.length > 8000 ? text.slice(0, 8000) + "\n\n[...truncated]" : text;
          }

          return {
            status: res.status,
            content_type: contentType,
            data: content,
          };
        } catch (err: any) {
          return { status: 0, error: err.message };
        }
      },
    }),

    store_memory: tool({
      description:
        "Permanently store a fact, code, preference, or any information the user asks you to remember. " +
        "Use this IMMEDIATELY when the user says 'remember', 'save', 'store', 'keep track of', or gives you information they'll ask about later (codes, passwords, preferences, names, dates, etc.). " +
        "The fact is stored permanently and can be recalled from ANY conversation or session.",
      parameters: z.object({
        fact: z.string().describe("The fact to remember, stated clearly and completely. Include all relevant context. E.g. 'User's door code is 4821' not just '4821'."),
        tags: z.array(z.string()).describe("Tags for categorization, e.g. ['code', 'security'] or ['preference', 'food']"),
      }),
      execute: async ({ fact, tags }) => {
        const result = await storeExplicitMemory(sessionId, fact, tags);
        return {
          stored: true,
          id: result.id,
          fact: result.fact,
          message: "Memory stored permanently. This will be available across all conversations.",
        };
      },
    }),

    recall_memory: tool({
      description:
        "Search your long-term memory for previously stored facts, codes, preferences, or any remembered information. " +
        "Use this when the user asks 'do you remember', 'what was my', 'what did I tell you', or references something from a previous conversation.",
      parameters: z.object({
        query: z.string().describe("What to search for in memory — be specific about the type of information (e.g. 'numeric code', 'favorite color', 'API key')"),
      }),
      execute: async ({ query }) => {
        const results = await recallMemories(query, 10);
        if (results.length === 0) {
          return {
            found: 0,
            message: "No matching memories found.",
            memories: [],
          };
        }
        return {
          found: results.length,
          memories: results.map((r) => ({
            content: r.content,
            type: r.type,
            stored_at: r.timestamp,
          })),
        };
      },
    }),

    search_tools: tool({
      description:
        "Search the tool registry for specialized tools that can help with the current task. Use this when the user asks you to do something that might require a specific tool, or when you want to check what tools are available. Returns tool names, descriptions, and instructions.",
      parameters: z.object({
        query: z.string().describe("What kind of tool to search for, can include tag names to filter"),
      }),
      execute: async ({ query }) => {
        const result = await listTools({ search: query, limit: 10 });
        if (result.tools.length === 0) {
          return {
            found: 0,
            message: "No matching tools found in the registry. You can create one with create_tool if needed.",
            tools: [],
          };
        }
        return {
          found: result.tools.length,
          tools: result.tools.map((t) => ({
            name: t.name,
            description: t.description,
            instructions: t.instructions,
            tags: t.tags,
          })),
        };
      },
    }),

    search_skills: tool({
      description:
        "Search for relevant skills (knowledge/instruction sets) that can help with the current task. Skills contain domain expertise and procedures.",
      parameters: z.object({
        query: z.string().describe("What kind of skill or knowledge to search for"),
      }),
      execute: async ({ query }) => {
        const skills = await getRelevantSkills(query, 5);
        if (skills.length === 0) {
          return { found: 0, message: "No matching skills found.", skills: [] };
        }
        return { found: skills.length, skills };
      },
    }),

    create_tool: tool({
      description:
        "Create a new tool in the registry. Use this when you identify a repeatable capability that should be saved for future use — for example, a specific API integration, a workflow, or a specialized procedure.",
      parameters: z.object({
        name: z.string().describe("Short, descriptive tool name"),
        description: z.string().describe("What the tool does"),
        instructions: z
          .string()
          .describe("Detailed instructions for how to use/execute the tool"),
        tags: z
          .string()
          .describe("Comma-separated tags for categorization and search, e.g. 'api,web,search'"),
      }),
      execute: async ({ name, description, instructions, tags }) => {
        const tagList = tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        const created = await createTool({
          name,
          description,
          instructions,
          tags: tagList,
        });
        return {
          status: "created",
          id: created.id,
          name: created.name,
          description: created.description,
        };
      },
    }),

    create_skill: tool({
      description:
        "Create a new skill (domain knowledge + procedural instructions). Use this to save comprehensive knowledge about how to accomplish a specific task — API integration guides, OAuth flows, multi-step procedures, domain expertise, etc. Skills are richer than tools and are discovered via search_skills. Always search_skills first to avoid duplicates.",
      parameters: z.object({
        name: z.string().describe("Short, descriptive skill name (e.g. 'Gmail API Integration', 'OAuth2 Code Flow')"),
        content: z
          .string()
          .describe("Full skill content: step-by-step instructions, API endpoints, code examples, gotchas, and any domain knowledge needed to execute this skill"),
        tags: z
          .string()
          .describe("Comma-separated tags for categorization and search, e.g. 'google,email,oauth'"),
      }),
      execute: async ({ name, content, tags }) => {
        const tagList = tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        const created = await createSkill({
          name,
          content,
          tags: tagList,
        });
        return {
          status: "created",
          id: created.id,
          name: created.name,
        };
      },
    }),

    create_schedule: tool({
      description:
        "Create a recurring scheduled task. The task will run in its own session at the specified times. If an origin session is provided, results will be posted back to it when idle. Use standard cron expressions (e.g. '*/15 * * * *' for every 15 min, '0 9 * * *' for daily at 9am, '0 0 * * 1' for every Monday). For one-time future tasks, use schedule_once instead.",
      parameters: z.object({
        name: z.string().describe("Short name for the schedule"),
        task_prompt: z
          .string()
          .describe("The task/instruction the agent should execute on each run"),
        cron_expression: z
          .string()
          .describe("Cron expression for when to run (e.g. '0 9 * * *' for daily at 9am UTC)"),
        origin_session_id: z
          .string()
          .describe("Session ID to send results back to. Use the current session ID so the user sees results."),
        max_runs: z
          .string()
          .describe("Maximum number of times to run. Use '0' for unlimited."),
      }),
      execute: async ({ name, task_prompt, cron_expression, origin_session_id, max_runs }) => {
        try {
          const maxRunsNum = parseInt(max_runs, 10);
          const schedule = await createSchedule({
            name,
            taskPrompt: task_prompt,
            cronExpression: cron_expression,
            originSessionId: origin_session_id || undefined,
            maxRuns: maxRunsNum > 0 ? maxRunsNum : undefined,
          });
          return {
            status: "created",
            id: schedule.id,
            name: schedule.name,
            cron_expression: schedule.cron_expression,
            next_run_at: schedule.next_run_at,
          };
        } catch (err: any) {
          return { status: "error", message: err.message };
        }
      },
    }),

    schedule_once: tool({
      description:
        "Schedule a task to run once at a specific future date/time. Use this when the user says things like 'remind me at 5pm', 'do this tomorrow morning', 'run this in 2 hours', etc. For recurring tasks, use create_schedule instead.",
      parameters: z.object({
        name: z.string().describe("Short name for the scheduled task"),
        task_prompt: z
          .string()
          .describe("The task/instruction the agent should execute at the scheduled time"),
        run_at: z
          .string()
          .describe("ISO 8601 datetime for when to run (e.g. '2026-03-28T15:00:00Z'). Must be in the future."),
        origin_session_id: z
          .string()
          .describe("Session ID to send results back to. Use the current session ID so the user sees results."),
      }),
      execute: async ({ name, task_prompt, run_at, origin_session_id }) => {
        try {
          const runAtDate = new Date(run_at);
          if (isNaN(runAtDate.getTime())) {
            return { status: "error", message: `Invalid date: ${run_at}` };
          }
          const schedule = await createOneTimeSchedule({
            name,
            taskPrompt: task_prompt,
            runAt: runAtDate,
            originSessionId: origin_session_id || undefined,
          });
          return {
            status: "scheduled",
            id: schedule.id,
            name: schedule.name,
            run_at: schedule.next_run_at,
          };
        } catch (err: any) {
          return { status: "error", message: err.message };
        }
      },
    }),

    list_schedules: tool({
      description:
        "List all schedules, both active and paused. Shows name, cron expression, status, and run count.",
      parameters: z.object({
        query: z.string().describe("Describe what you are looking for, or use 'all' to list everything"),
      }),
      execute: async () => {
        const result = await listSchedules(50, 0);
        if (result.schedules.length === 0) {
          return { found: 0, message: "No schedules exist yet.", schedules: [] };
        }
        return {
          found: result.schedules.length,
          schedules: result.schedules.map((s) => ({
            id: s.id,
            name: s.name,
            cron_expression: s.cron_expression,
            enabled: s.enabled,
            run_count: s.run_count,
            max_runs: s.max_runs,
            next_run_at: s.next_run_at,
            last_run_at: s.last_run_at,
          })),
        };
      },
    }),

    cancel_schedule: tool({
      description: "Cancel/delete a schedule by its ID. This permanently removes the schedule.",
      parameters: z.object({
        schedule_id: z.string().describe("The ID of the schedule to cancel"),
      }),
      execute: async ({ schedule_id }) => {
        const deleted = await deleteSchedule(schedule_id);
        return {
          status: deleted ? "deleted" : "not_found",
          id: schedule_id,
        };
      },
    }),

    execute_code: tool({
      description:
        "Execute Python code in a sandboxed workspace. The code runs in an isolated Docker container with Python 3.12, numpy, pandas, matplotlib, and requests pre-installed. Files written to the workspace persist across calls within the same session. Use this for data analysis, computation, file generation, or any task that benefits from running real code.",
      parameters: z.object({
        code: z.string().describe("Python code to execute"),
        timeout_ms: z.string().describe("Execution timeout in milliseconds. Use '30000' for normal tasks, higher for long-running computations."),
      }),
      execute: async ({ code, timeout_ms }) => {
        try {
          const before = await snapshotWorkspaceFiles(sessionId);
          const timeout = parseInt(timeout_ms, 10) || undefined;
          const result = await executeCode(sessionId, code, timeout);
          const after = await snapshotWorkspaceFiles(sessionId);
          const created_files = [...after].filter((f) => !before.has(f));
          return {
            stdout: result.stdout.slice(0, 16000),
            stderr: result.stderr.slice(0, 4000),
            exit_code: result.exitCode,
            ...(created_files.length > 0 ? { created_files } : {}),
          };
        } catch (err: any) {
          return { stdout: "", stderr: err.message, exit_code: -1 };
        }
      },
    }),

    shell_exec: tool({
      description:
        "Execute a shell command in the sandboxed workspace. Runs in the same isolated container as execute_code. Use for file operations, installing pip packages, running scripts, etc.",
      parameters: z.object({
        command: z.string().describe("Shell command to execute (runs with bash -c)"),
        timeout_ms: z.string().describe("Execution timeout in milliseconds. Use '30000' for normal tasks."),
      }),
      execute: async ({ command, timeout_ms }) => {
        try {
          const before = await snapshotWorkspaceFiles(sessionId);
          const timeout = parseInt(timeout_ms, 10) || undefined;
          const result = await shellExec(sessionId, command, timeout);
          const after = await snapshotWorkspaceFiles(sessionId);
          const created_files = [...after].filter((f) => !before.has(f));
          return {
            stdout: result.stdout.slice(0, 16000),
            stderr: result.stderr.slice(0, 4000),
            exit_code: result.exitCode,
            ...(created_files.length > 0 ? { created_files } : {}),
          };
        } catch (err: any) {
          return { stdout: "", stderr: err.message, exit_code: -1 };
        }
      },
    }),

    write_file: tool({
      description:
        "Write a file to the sandboxed workspace. The file will be available to execute_code and shell_exec. Creates parent directories automatically. Use this to create Python scripts, data files, configs, etc.",
      parameters: z.object({
        path: z.string().describe("Relative file path within the workspace (e.g. 'main.py', 'data/input.csv')"),
        content: z.string().describe("File content to write"),
      }),
      execute: async ({ path: filePath, content }) => {
        try {
          await writeFileInSandbox(sessionId, filePath, content);
          return { status: "written", path: filePath, size: content.length };
        } catch (err: any) {
          return { status: "error", message: err.message };
        }
      },
    }),

    read_file: tool({
      description:
        "Read a file from the sandboxed workspace. Use this to inspect outputs, check generated files, or read data produced by execute_code.",
      parameters: z.object({
        path: z.string().describe("Relative file path within the workspace to read"),
      }),
      execute: async ({ path: filePath }) => {
        try {
          const content = await readFileFromSandbox(sessionId, filePath);
          return {
            status: "ok",
            path: filePath,
            content: content.length > 16000 ? content.slice(0, 16000) + "\n[...truncated]" : content,
            size: content.length,
          };
        } catch (err: any) {
          return { status: "error", message: err.message };
        }
      },
    }),

    list_workspace_files: tool({
      description:
        "List files and directories in YOUR sandboxed workspace. Use this whenever the user asks to see files, list files, check what's in the workspace, or when you need to verify file creation. This is YOUR workspace — you always have access to it.",
      parameters: z.object({
        directory: z.string().describe("Relative directory path to list. Use '.' or '' for the root workspace."),
      }),
      execute: async ({ directory }) => {
        try {
          const files = await listFilesInSandbox(sessionId, directory || undefined);
          return { status: "ok", directory: directory || ".", files };
        } catch (err: any) {
          return { status: "error", message: err.message, files: [] };
        }
      },
    }),

    // ===== Background Process & Port Forwarding Tools =====

    background_exec: tool({
      description:
        "Start a long-running command in the sandbox that runs in the background (e.g. a web server, file watcher, build process). " +
        "Returns immediately with the PID and a log file path. Use read_process_log to check output later. " +
        "Combine with port_forward to expose servers to the host network.",
      parameters: z.object({
        command: z.string().describe("Shell command to run in the background (e.g. 'python -m http.server 8000', 'npm run dev')"),
        log_file: z.string().describe("Optional log file path inside the container. Use '' for auto-generated path."),
      }),
      execute: async ({ command, log_file }) => {
        try {
          const result = await execBackground(sessionId, command, log_file || undefined);
          return {
            status: "started",
            pid: result.pid,
            log_file: result.logFile,
            message: `Background process started with PID ${result.pid}. Use read_process_log to check output. Use port_forward to expose any listening ports.`,
          };
        } catch (err: any) {
          return { status: "error", message: err.message };
        }
      },
    }),

    read_process_log: tool({
      description:
        "Read the output log of a background process started with background_exec. Shows the last N lines of the log file.",
      parameters: z.object({
        log_file: z.string().describe("Log file path returned by background_exec"),
        lines: z.string().describe("Number of lines to read from the tail. Use '50' for a reasonable amount."),
      }),
      execute: async ({ log_file, lines }) => {
        try {
          const n = parseInt(lines, 10) || 50;
          const output = await readProcessLog(sessionId, log_file, n);
          return {
            status: "ok",
            log_file,
            output: output.slice(0, 16000),
          };
        } catch (err: any) {
          return { status: "error", message: err.message };
        }
      },
    }),

    list_processes: tool({
      description:
        "List all running processes in the sandbox. Shows PIDs, CPU/memory usage, and command lines. Useful for checking on background processes.",
      parameters: z.object({
        query: z.string().describe("Describe what you're looking for, or use 'all' to list everything"),
      }),
      execute: async () => {
        try {
          const output = await listProcesses(sessionId);
          return {
            status: "ok",
            processes: output.slice(0, 8000),
          };
        } catch (err: any) {
          return { status: "error", message: err.message };
        }
      },
    }),

    kill_process: tool({
      description:
        "Kill a running process in the sandbox by PID. Use list_processes to find PIDs first.",
      parameters: z.object({
        pid: z.string().describe("Process ID to kill"),
        signal: z.string().describe("Signal to send: 'TERM' for graceful shutdown, 'KILL' for force kill. Default: 'TERM'."),
      }),
      execute: async ({ pid, signal }) => {
        try {
          const pidNum = parseInt(pid, 10);
          if (isNaN(pidNum)) return { status: "error", message: "Invalid PID" };
          const result = await killProcess(sessionId, pidNum, signal || "TERM");
          return { status: result.success ? "killed" : "error", pid: pidNum, output: result.output };
        } catch (err: any) {
          return { status: "error", message: err.message };
        }
      },
    }),

    port_forward: tool({
      description:
        "Forward a port from the sandbox container to the host machine, making a server running in the sandbox accessible from outside. " +
        "For example, if you start a web server on port 8000 inside the sandbox, use this to make it reachable at http://HOST_IP:PORT. " +
        "Use background_exec to start the server first, then port_forward to expose it.",
      parameters: z.object({
        container_port: z.string().describe("Port number inside the sandbox to forward (e.g. '8000', '3000')"),
        host_port: z.string().describe("Preferred host port number. Use '' for auto-assignment from the configured range."),
      }),
      execute: async ({ container_port, host_port }) => {
        try {
          const cp = parseInt(container_port, 10);
          if (isNaN(cp) || cp < 1 || cp > 65535) return { status: "error", message: "Invalid container port" };
          const hp = host_port ? parseInt(host_port, 10) : undefined;
          const result = await addPortForward(sessionId, cp, hp);
          return {
            status: "forwarded",
            container_port: result.containerPort,
            host_port: result.hostPort,
            message: `Port ${result.containerPort} in sandbox is now accessible at host port ${result.hostPort}`,
          };
        } catch (err: any) {
          return { status: "error", message: err.message };
        }
      },
    }),

    remove_port_forward: tool({
      description:
        "Remove a port forward previously created with port_forward. Stops exposing the sandbox port to the host.",
      parameters: z.object({
        container_port: z.string().describe("Container port number to stop forwarding"),
      }),
      execute: async ({ container_port }) => {
        try {
          const cp = parseInt(container_port, 10);
          const removed = await removePortForward(sessionId, cp);
          return {
            status: removed ? "removed" : "not_found",
            container_port: cp,
          };
        } catch (err: any) {
          return { status: "error", message: err.message };
        }
      },
    }),

    sandbox_status: tool({
      description:
        "Get the status of the current sandbox, including running state, forwarded ports, memory usage, and container details.",
      parameters: z.object({
        query: z.string().describe("Describe what you want to know, or use 'all' for full status"),
      }),
      execute: async () => {
        try {
          const info = await getSandboxInfo(sessionId);
          if (!info) return { status: "not_running", message: "No sandbox container is running for this session." };
          return {
            status: "ok",
            sandbox: {
              session_id: info.sessionId,
              container_id: info.containerId,
              state: info.status,
              created: info.created,
              memory_limit_mb: info.memoryLimitMB,
              image: info.image,
              forwarded_ports: info.ports,
            },
          };
        } catch (err: any) {
          return { status: "error", message: err.message };
        }
      },
    }),

    request_resource_increase: tool({
      description:
        "Request an increase to the sandbox container's memory limit. Use this when a process was killed (exit code 137 / OOM) " +
        "or when you anticipate needing more memory for a task (e.g. large builds, data processing). " +
        "The increase is applied live to the running container — no restart needed. " +
        "Maximum allowed is configured server-side (default 2048 MB).",
      parameters: z.object({
        memory_mb: z.coerce
          .number()
          .describe("Requested memory limit in MB (e.g. 512, 1024, 2048)"),
        reason: z
          .string()
          .describe("Why the increase is needed (e.g. 'OOM killed during npm install', 'need to process large dataset')"),
      }),
      execute: async ({ memory_mb, reason }) => {
        try {
          const max = config.KRAKEN_SANDBOX_MAX_MEMORY_MB;
          const requested = Math.min(memory_mb, max);
          if (requested < 64) {
            return { status: "error", message: "Minimum memory is 64 MB" };
          }
          const current = await getSandboxInfo(sessionId);
          if (!current) {
            return { status: "error", message: "No sandbox is running for this session" };
          }
          console.log(
            `[sandbox] Resource increase requested for ${sessionId}: ${current.memoryLimitMB}MB → ${requested}MB (reason: ${reason})`,
          );
          const result = await updateSandboxResources(sessionId, requested);
          return {
            status: "ok",
            previous_memory_mb: current.memoryLimitMB,
            new_memory_mb: result.memoryMB,
            max_allowed_mb: max,
            capped: memory_mb > max,
            message: memory_mb > max
              ? `Requested ${memory_mb}MB but capped at server maximum of ${max}MB`
              : `Memory increased from ${current.memoryLimitMB}MB to ${result.memoryMB}MB`,
          };
        } catch (err: any) {
          return { status: "error", message: err.message };
        }
      },
    }),

    // ===== Git Tools =====

    git_clone: tool({
      description:
        "Clone a Git repository into the sandboxed workspace. Supports HTTPS URLs. For private repos, a git token is configured server-side. Use a shallow clone (depth 1) for large repos unless full history is needed.",
      parameters: z.object({
        url: z.string().describe("HTTPS URL of the repository (e.g. 'https://github.com/user/repo')"),
        directory: z.string().describe("Target directory name inside the workspace. Use the repo name (e.g. 'repo')."),
        depth: z.string().describe("Clone depth. Use '1' for shallow clone (faster), '0' for full history."),
        branch: z.string().describe("Branch to clone. Use '' for default branch."),
      }),
      execute: async ({ url: repoUrl, directory, depth, branch }) => {
        try {
          // Inject token for authenticated cloning if available
          let cloneUrl = repoUrl;
          if (config.KRAKEN_GIT_TOKEN && repoUrl.startsWith("https://")) {
            const parsed = new URL(repoUrl);
            parsed.username = "x-access-token";
            parsed.password = config.KRAKEN_GIT_TOKEN;
            cloneUrl = parsed.toString();
          }

          let cmd = `git clone`;
          const depthNum = parseInt(depth, 10);
          if (depthNum > 0) cmd += ` --depth ${depthNum}`;
          if (branch) cmd += ` --branch ${branch}`;
          cmd += ` '${cloneUrl}' '${directory}'`;

          const result = await shellExec(sessionId, cmd, 120000);
          // Scrub token from any output
          const cleanStdout = result.stdout.replace(/x-access-token:[^@]+@/g, "***@");
          const cleanStderr = result.stderr.replace(/x-access-token:[^@]+@/g, "***@");
          return {
            stdout: cleanStdout.slice(0, 4000),
            stderr: cleanStderr.slice(0, 4000),
            exit_code: result.exitCode,
          };
        } catch (err: any) {
          return { stdout: "", stderr: err.message, exit_code: -1 };
        }
      },
    }),

    git_status: tool({
      description:
        "Show the Git status of a repository in the workspace. Returns branch name, modified/staged/untracked files, and ahead/behind counts.",
      parameters: z.object({
        directory: z.string().describe("Repository directory in the workspace (e.g. 'repo' or '.' for root)"),
      }),
      execute: async ({ directory }) => {
        try {
          const result = await shellExec(
            sessionId,
            `cd '${directory}' && git status --porcelain=v2 --branch 2>&1`,
            10000,
          );
          return {
            stdout: result.stdout.slice(0, 8000),
            stderr: result.stderr.slice(0, 2000),
            exit_code: result.exitCode,
          };
        } catch (err: any) {
          return { stdout: "", stderr: err.message, exit_code: -1 };
        }
      },
    }),

    git_diff: tool({
      description:
        "Show the diff of changes in a Git repository. Can show unstaged changes, staged changes, or diff between two refs (commits, branches, tags).",
      parameters: z.object({
        directory: z.string().describe("Repository directory in the workspace"),
        mode: z.string().describe("'unstaged' for working tree changes, 'staged' for staged changes, 'refs' to compare two refs"),
        ref1: z.string().describe("First ref for comparison (commit hash, branch, tag). Only used when mode='refs'. Use '' otherwise."),
        ref2: z.string().describe("Second ref for comparison. Only used when mode='refs'. Use '' otherwise."),
        path_filter: z.string().describe("Optional file path filter. Use '' for all files."),
      }),
      execute: async ({ directory, mode, ref1, ref2, path_filter }) => {
        try {
          let cmd = `cd '${directory}' && git diff --stat --patch`;
          if (mode === "staged") cmd = `cd '${directory}' && git diff --cached --stat --patch`;
          else if (mode === "refs" && ref1 && ref2) cmd = `cd '${directory}' && git diff ${ref1} ${ref2} --stat --patch`;
          else if (mode === "refs" && ref1) cmd = `cd '${directory}' && git diff ${ref1} --stat --patch`;
          if (path_filter) cmd += ` -- '${path_filter}'`;

          const result = await shellExec(sessionId, cmd, 15000);
          return {
            stdout: result.stdout.slice(0, 16000),
            stderr: result.stderr.slice(0, 2000),
            exit_code: result.exitCode,
          };
        } catch (err: any) {
          return { stdout: "", stderr: err.message, exit_code: -1 };
        }
      },
    }),

    git_log: tool({
      description:
        "Show recent Git commit history. Returns commit hashes, authors, dates, and messages.",
      parameters: z.object({
        directory: z.string().describe("Repository directory in the workspace"),
        count: z.string().describe("Number of commits to show (e.g. '20')"),
        path_filter: z.string().describe("Optional: show commits affecting this file/directory only. Use '' for all."),
        format: z.string().describe("'oneline' for compact output, 'full' for detailed output with stats"),
      }),
      execute: async ({ directory, count, path_filter, format }) => {
        try {
          const n = parseInt(count, 10) || 20;
          const fmt = format === "full"
            ? `--format='%H%n%an <%ae>%n%ad%n%s%n%b%n---' --date=iso --stat`
            : `--oneline`;
          let cmd = `cd '${directory}' && git log -${n} ${fmt}`;
          if (path_filter) cmd += ` -- '${path_filter}'`;

          const result = await shellExec(sessionId, cmd, 15000);
          return {
            stdout: result.stdout.slice(0, 16000),
            stderr: result.stderr.slice(0, 2000),
            exit_code: result.exitCode,
          };
        } catch (err: any) {
          return { stdout: "", stderr: err.message, exit_code: -1 };
        }
      },
    }),

    git_commit: tool({
      description:
        "Stage files and create a Git commit. Can stage all changes or specific files. Automatically configures git user identity in the sandbox.",
      parameters: z.object({
        directory: z.string().describe("Repository directory in the workspace"),
        message: z.string().describe("Commit message"),
        files: z.string().describe("Files to stage. Use '.' to stage all changes, or space-separated paths for specific files."),
      }),
      execute: async ({ directory, message, files }) => {
        try {
          // Ensure git identity is configured (sandbox containers are ephemeral)
          await shellExec(sessionId, `cd '${directory}' && git config user.email 'kraken-agent@users.noreply.github.com' && git config user.name 'Kraken Agent'`, 5000);
          // Sanitize commit message for shell
          const safeMsg = message.replace(/'/g, "'\\''");
          const cmd = `cd '${directory}' && git add ${files} && git commit -m '${safeMsg}'`;
          const result = await shellExec(sessionId, cmd, 15000);
          return {
            stdout: result.stdout.slice(0, 4000),
            stderr: result.stderr.slice(0, 2000),
            exit_code: result.exitCode,
          };
        } catch (err: any) {
          return { stdout: "", stderr: err.message, exit_code: -1 };
        }
      },
    }),

    git_branch: tool({
      description:
        "Create, switch, or list Git branches.",
      parameters: z.object({
        directory: z.string().describe("Repository directory in the workspace"),
        action: z.string().describe("'list' to list branches, 'create' to create a new branch, 'switch' to switch to an existing branch"),
        branch_name: z.string().describe("Branch name for create/switch. Use '' for list action."),
      }),
      execute: async ({ directory, action, branch_name }) => {
        try {
          let cmd: string;
          switch (action) {
            case "create":
              cmd = `cd '${directory}' && git checkout -b '${branch_name}'`;
              break;
            case "switch":
              cmd = `cd '${directory}' && git checkout '${branch_name}'`;
              break;
            default:
              cmd = `cd '${directory}' && git branch -a -vv`;
          }
          const result = await shellExec(sessionId, cmd, 10000);
          return {
            stdout: result.stdout.slice(0, 8000),
            stderr: result.stderr.slice(0, 2000),
            exit_code: result.exitCode,
          };
        } catch (err: any) {
          return { stdout: "", stderr: err.message, exit_code: -1 };
        }
      },
    }),

    git_patch: tool({
      description:
        "Generate a patch file from current changes or between refs, or apply a patch file. Useful for code review workflows and sharing changes.",
      parameters: z.object({
        directory: z.string().describe("Repository directory in the workspace"),
        action: z.string().describe("'generate' to create a patch file, 'apply' to apply a patch file"),
        patch_path: z.string().describe("Path for the patch file. When generating, it's the output path. When applying, it's the input path."),
        ref: z.string().describe("For generate: ref to diff against (e.g. 'HEAD~3', 'main'). Use '' for unstaged changes."),
      }),
      execute: async ({ directory, action, patch_path, ref }) => {
        try {
          let cmd: string;
          if (action === "apply") {
            cmd = `cd '${directory}' && git apply '${patch_path}'`;
          } else {
            const diffRef = ref || "";
            cmd = `cd '${directory}' && git diff ${diffRef} > '${patch_path}'`;
          }
          const result = await shellExec(sessionId, cmd, 15000);
          return {
            stdout: result.stdout.slice(0, 4000),
            stderr: result.stderr.slice(0, 2000),
            exit_code: result.exitCode,
          };
        } catch (err: any) {
          return { stdout: "", stderr: err.message, exit_code: -1 };
        }
      },
    }),

    git_push: tool({
      description:
        "Push local commits to a remote Git repository. Requires a git token configured server-side for authentication. Always create and switch to a feature branch before pushing — never push directly to main/master.",
      parameters: z.object({
        directory: z.string().describe("Repository directory in the workspace"),
        remote: z.string().describe("Remote name (usually 'origin')"),
        branch: z.string().describe("Branch name to push (e.g. 'feature/improve-tools')"),
        force: z.string().describe("'true' to force push (overwrite remote branch), 'false' for normal push. Almost always use 'false'."),
        set_upstream: z.string().describe("'true' to set upstream tracking (-u flag), 'false' otherwise. Use 'true' when pushing a new branch for the first time."),
      }),
      execute: async ({ directory, remote, branch, force, set_upstream }) => {
        try {
          if (!config.KRAKEN_GIT_TOKEN) {
            return { stdout: "", stderr: "KRAKEN_GIT_TOKEN is not configured. Cannot push without authentication.", exit_code: -1 };
          }

          // Inject token into remote URL for authenticated push
          const getUrlCmd = `cd '${directory}' && git remote get-url '${remote}'`;
          const urlResult = await shellExec(sessionId, getUrlCmd, 5000);
          const remoteUrl = urlResult.stdout.trim();

          if (!remoteUrl.startsWith("https://")) {
            return { stdout: "", stderr: "Only HTTPS remotes are supported for authenticated push.", exit_code: -1 };
          }

          // Set authenticated remote URL temporarily
          const parsed = new URL(remoteUrl);
          parsed.username = "x-access-token";
          parsed.password = config.KRAKEN_GIT_TOKEN;
          const authUrl = parsed.toString();

          // Configure git identity if not already set
          await shellExec(sessionId, `cd '${directory}' && git config user.email 'kraken-agent@users.noreply.github.com' && git config user.name 'Kraken Agent'`, 5000);

          const setUrlCmd = `cd '${directory}' && git remote set-url '${remote}' '${authUrl}'`;
          await shellExec(sessionId, setUrlCmd, 5000);

          try {
            const forceFlag = force === "true" ? "--force" : "";
            const upstreamFlag = set_upstream === "true" ? "-u" : "";
            const pushCmd = `cd '${directory}' && git push ${forceFlag} ${upstreamFlag} '${remote}' '${branch}' 2>&1`;
            const result = await shellExec(sessionId, pushCmd, 30000);

            // Scrub token from output
            const cleanStdout = result.stdout.replace(/x-access-token:[^@]+@/g, "***@");
            const cleanStderr = result.stderr.replace(/x-access-token:[^@]+@/g, "***@");
            return {
              stdout: cleanStdout.slice(0, 4000),
              stderr: cleanStderr.slice(0, 2000),
              exit_code: result.exitCode,
            };
          } finally {
            // Always restore the original (non-authenticated) remote URL
            const resetCmd = `cd '${directory}' && git remote set-url '${remote}' '${remoteUrl}'`;
            await shellExec(sessionId, resetCmd, 5000).catch(() => {});
          }
        } catch (err: any) {
          const cleanMsg = (err.message || "").replace(/x-access-token:[^@]+@/g, "***@");
          return { stdout: "", stderr: cleanMsg, exit_code: -1 };
        }
      },
    }),

    github_create_pr: tool({
      description:
        "Create a pull request on GitHub via the GitHub REST API. The branch must be pushed to the remote first using git_push. Requires KRAKEN_GIT_TOKEN with 'repo' scope.",
      parameters: z.object({
        owner: z.string().describe("Repository owner (GitHub username or org, e.g. 'octocat')"),
        repo: z.string().describe("Repository name (e.g. 'my-project')"),
        title: z.string().describe("Pull request title"),
        body: z.string().describe("Pull request description in Markdown. Explain what changed and why."),
        head: z.string().describe("The branch containing the changes (e.g. 'feature/improve-tools')"),
        base: z.string().describe("The branch to merge into (e.g. 'main')"),
      }),
      execute: async ({ owner, repo, title, body, head, base }) => {
        try {
          if (!config.KRAKEN_GIT_TOKEN) {
            return { error: "KRAKEN_GIT_TOKEN is not configured. Cannot create PR without authentication." };
          }

          const response = await fetch(
            `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${config.KRAKEN_GIT_TOKEN}`,
                Accept: "application/vnd.github+json",
                "Content-Type": "application/json",
                "User-Agent": "KrakenAgent/1.0",
                "X-GitHub-Api-Version": "2022-11-28",
              },
              body: JSON.stringify({ title, body, head, base }),
              signal: AbortSignal.timeout(15000),
            },
          );

          const data = (await response.json()) as Record<string, unknown>;

          if (!response.ok) {
            return {
              error: `GitHub API returned ${response.status}: ${(data.message as string) || JSON.stringify(data)}`,
              status: response.status,
            };
          }

          return {
            status: "created",
            pr_number: data.number,
            pr_url: data.html_url,
            title: data.title,
            state: data.state,
          };
        } catch (err: any) {
          return { error: err.message };
        }
      },
    }),

    github_list_prs: tool({
      description:
        "List open pull requests on a GitHub repository. Useful for checking if a PR already exists for a branch before creating a new one.",
      parameters: z.object({
        owner: z.string().describe("Repository owner (GitHub username or org)"),
        repo: z.string().describe("Repository name"),
        state: z.string().describe("'open', 'closed', or 'all' (default: 'open')"),
        head: z.string().describe("Filter by head branch (e.g. 'owner:feature-branch'). Use '' for no filter."),
      }),
      execute: async ({ owner, repo, state, head }) => {
        try {
          if (!config.KRAKEN_GIT_TOKEN) {
            return { error: "KRAKEN_GIT_TOKEN is not configured." };
          }

          const params = new URLSearchParams({ state: state || "open", per_page: "10" });
          if (head) params.set("head", head);

          const response = await fetch(
            `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?${params}`,
            {
              headers: {
                Authorization: `Bearer ${config.KRAKEN_GIT_TOKEN}`,
                Accept: "application/vnd.github+json",
                "User-Agent": "KrakenAgent/1.0",
                "X-GitHub-Api-Version": "2022-11-28",
              },
              signal: AbortSignal.timeout(15000),
            },
          );

          const data = (await response.json()) as Array<Record<string, unknown>>;

          if (!response.ok) {
            return {
              error: `GitHub API returned ${response.status}`,
              status: response.status,
            };
          }

          return {
            count: data.length,
            pull_requests: data.map((pr) => ({
              number: pr.number,
              title: pr.title,
              state: pr.state,
              head_branch: (pr.head as Record<string, unknown>)?.ref,
              base_branch: (pr.base as Record<string, unknown>)?.ref,
              url: pr.html_url,
              author: (pr.user as Record<string, unknown>)?.login,
            })),
          };
        } catch (err: any) {
          return { error: err.message };
        }
      },
    }),

    github_get_file: tool({
      description:
        "Read a file's content directly from a GitHub repository without cloning. Returns the file content, SHA, and metadata. Useful for quickly reading specific files from any public or private repo.",
      parameters: z.object({
        owner: z.string().describe("Repository owner (GitHub username or org)"),
        repo: z.string().describe("Repository name"),
        path: z.string().describe("File path in the repository (e.g. 'src/index.ts', 'README.md')"),
        ref: z.string().describe("Branch, tag, or commit SHA to read from. Use '' for default branch."),
      }),
      execute: async ({ owner, repo, path: filePath, ref }) => {
        try {
          const token = config.KRAKEN_GIT_TOKEN;
          const headers: Record<string, string> = {
            Accept: "application/vnd.github+json",
            "User-Agent": "KrakenAgent/1.0",
            "X-GitHub-Api-Version": "2022-11-28",
          };
          if (token) headers.Authorization = `Bearer ${token}`;

          const params = ref ? `?ref=${encodeURIComponent(ref)}` : "";
          const response = await fetch(
            `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}${params}`,
            { headers, signal: AbortSignal.timeout(15000) },
          );

          const data = (await response.json()) as Record<string, unknown>;

          if (!response.ok) {
            return { error: `GitHub API returned ${response.status}: ${(data.message as string) || "Unknown error"}` };
          }

          if (data.type !== "file") {
            return { error: `Path '${filePath}' is a ${data.type}, not a file. Use github_list_files for directories.` };
          }

          // Decode base64 content
          const content = Buffer.from(data.content as string, "base64").toString("utf-8");
          return {
            path: data.path,
            sha: data.sha,
            size: data.size,
            content: content.slice(0, 32000),
            truncated: content.length > 32000,
          };
        } catch (err: any) {
          return { error: err.message };
        }
      },
    }),

    github_list_files: tool({
      description:
        "List files and directories in a GitHub repository path without cloning. Returns names, types, and sizes. Use this to explore repo structure before reading specific files.",
      parameters: z.object({
        owner: z.string().describe("Repository owner (GitHub username or org)"),
        repo: z.string().describe("Repository name"),
        path: z.string().describe("Directory path in the repository. Use '' for repo root."),
        ref: z.string().describe("Branch, tag, or commit SHA. Use '' for default branch."),
      }),
      execute: async ({ owner, repo, path: dirPath, ref }) => {
        try {
          const token = config.KRAKEN_GIT_TOKEN;
          const headers: Record<string, string> = {
            Accept: "application/vnd.github+json",
            "User-Agent": "KrakenAgent/1.0",
            "X-GitHub-Api-Version": "2022-11-28",
          };
          if (token) headers.Authorization = `Bearer ${token}`;

          const params = ref ? `?ref=${encodeURIComponent(ref)}` : "";
          const apiPath = dirPath ? `/${dirPath}` : "";
          const response = await fetch(
            `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents${apiPath}${params}`,
            { headers, signal: AbortSignal.timeout(15000) },
          );

          const data = (await response.json()) as unknown;

          if (!response.ok) {
            return { error: `GitHub API returned ${response.status}: ${((data as Record<string, unknown>).message as string) || "Unknown error"}` };
          }

          if (!Array.isArray(data)) {
            return { error: `Path '${dirPath}' is a file, not a directory. Use github_get_file to read it.` };
          }

          return {
            count: data.length,
            items: data.map((item: Record<string, unknown>) => ({
              name: item.name,
              type: item.type,
              size: item.size,
              path: item.path,
            })),
          };
        } catch (err: any) {
          return { error: err.message };
        }
      },
    }),

    // ===== Code Review & Analysis Tools =====

    search_code: tool({
      description:
        "Search for patterns in code files across the workspace using ripgrep. Much faster than grep. Returns structured results with file paths, line numbers, and matching lines. Use this to find function definitions, variable usage, imports, TODOs, etc.",
      parameters: z.object({
        directory: z.string().describe("Directory to search in (e.g. 'repo/src' or '.')"),
        pattern: z.string().describe("Search pattern (regex supported). E.g. 'function.*auth', 'TODO|FIXME', 'import.*express'"),
        file_glob: z.string().describe("File type filter glob. E.g. '*.py', '*.ts', '*.{js,ts}'. Use '' for all files."),
        context_lines: z.string().describe("Number of context lines around each match. Use '0' for match-only, '2' for some context."),
      }),
      execute: async ({ directory, pattern, file_glob, context_lines }) => {
        try {
          const ctx = parseInt(context_lines, 10) || 0;
          let cmd = `cd '${directory}' && rg --json -C ${ctx}`;
          if (file_glob) cmd += ` --glob '${file_glob}'`;
          cmd += ` '${pattern}' | head -200`;

          const result = await shellExec(sessionId, cmd, 15000);

          // Parse ripgrep JSON output into structured results
          if (result.exitCode === 0 && result.stdout.trim()) {
            const matches: Array<{ file: string; line: number; text: string }> = [];
            for (const line of result.stdout.split("\n").filter(Boolean)) {
              try {
                const entry = JSON.parse(line);
                if (entry.type === "match") {
                  matches.push({
                    file: entry.data?.path?.text ?? "",
                    line: entry.data?.line_number ?? 0,
                    text: entry.data?.lines?.text?.trim() ?? "",
                  });
                }
              } catch {
                // Skip non-JSON lines
              }
            }
            return { found: matches.length, matches: matches.slice(0, 50) };
          }

          return {
            found: 0,
            stdout: result.stdout.slice(0, 4000),
            stderr: result.stderr.slice(0, 2000),
            exit_code: result.exitCode,
          };
        } catch (err: any) {
          return { found: 0, stderr: err.message, exit_code: -1 };
        }
      },
    }),

    run_linter: tool({
      description:
        "Run a linter on code in the workspace. Auto-detects the linter based on file type: ruff for Python, eslint for JavaScript/TypeScript. Returns structured lint results with severity, file, line, and message.",
      parameters: z.object({
        directory: z.string().describe("Directory or file to lint (e.g. 'repo/src', 'repo/main.py')"),
        language: z.string().describe("'python' to use ruff, 'javascript' or 'typescript' to use eslint. Use 'auto' to detect from file extension."),
        fix: z.string().describe("'true' to auto-fix fixable issues, 'false' to report only"),
      }),
      execute: async ({ directory, language, fix }) => {
        try {
          const autoFix = fix === "true";
          let cmd: string;

          if (language === "python" || language === "auto") {
            cmd = `cd '${directory}' && ruff check ${autoFix ? "--fix" : ""} --output-format json . 2>&1 || true`;
          } else {
            // JS/TS — try npx eslint
            cmd = `cd '${directory}' && npx --yes eslint ${autoFix ? "--fix" : ""} --format json . 2>&1 || true`;
          }

          const result = await shellExec(sessionId, cmd, 30000);
          return {
            stdout: result.stdout.slice(0, 16000),
            stderr: result.stderr.slice(0, 2000),
            exit_code: result.exitCode,
          };
        } catch (err: any) {
          return { stdout: "", stderr: err.message, exit_code: -1 };
        }
      },
    }),

    file_diff: tool({
      description:
        "Compare two files and show a unified diff. Useful for reviewing changes between file versions or comparing implementations.",
      parameters: z.object({
        file_a: z.string().describe("Path to the first file (relative to workspace root)"),
        file_b: z.string().describe("Path to the second file (relative to workspace root)"),
      }),
      execute: async ({ file_a, file_b }) => {
        try {
          const result = await shellExec(
            sessionId,
            `diff -u '${file_a}' '${file_b}' || true`,
            10000,
          );
          return {
            diff: result.stdout.slice(0, 16000),
            exit_code: result.exitCode,
          };
        } catch (err: any) {
          return { diff: "", stderr: err.message, exit_code: -1 };
        }
      },
    }),

    // ===== Testing Tools =====

    run_tests: tool({
      description:
        "Run tests in a project. Auto-detects the test framework: pytest for Python, vitest/jest for JavaScript/TypeScript. Returns structured test results with pass/fail counts and error details.",
      parameters: z.object({
        directory: z.string().describe("Project root directory containing the tests"),
        filter: z.string().describe("Optional test filter — test file path, test name pattern, or marker. Use '' to run all tests."),
        verbose: z.string().describe("'true' for verbose output with individual test results, 'false' for summary only"),
      }),
      execute: async ({ directory, filter, verbose }) => {
        try {
          // Detect test framework
          const detectResult = await shellExec(
            sessionId,
            `cd '${directory}' && (test -f package.json && echo 'node') || (test -f pyproject.toml && echo 'python') || (test -f setup.py && echo 'python') || (ls *.py test_*.py tests/ 2>/dev/null && echo 'python') || echo 'unknown'`,
            5000,
          );
          const projectType = detectResult.stdout.trim().split("\n").pop() ?? "unknown";

          let cmd: string;
          if (projectType.includes("python")) {
            const vFlag = verbose === "true" ? "-v" : "";
            const filterArg = filter ? `-k '${filter}'` : "";
            cmd = `cd '${directory}' && python -m pytest ${vFlag} ${filterArg} --tb=short 2>&1`;
          } else if (projectType.includes("node")) {
            // Detect vitest vs jest
            const pkgResult = await shellExec(sessionId, `cd '${directory}' && cat package.json`, 5000);
            const hasVitest = pkgResult.stdout.includes("vitest");
            const runner = hasVitest ? "npx vitest run" : "npx jest";
            const vFlag = verbose === "true" ? "--verbose" : "";
            const filterArg = filter || "";
            cmd = `cd '${directory}' && ${runner} ${vFlag} ${filterArg} 2>&1`;
          } else {
            return { stdout: "", stderr: `Could not detect test framework in '${directory}'. Expected package.json or pyproject.toml.`, exit_code: -1 };
          }

          const result = await shellExec(sessionId, cmd, 120000);
          return {
            stdout: result.stdout.slice(0, 16000),
            stderr: result.stderr.slice(0, 4000),
            exit_code: result.exitCode,
          };
        } catch (err: any) {
          return { stdout: "", stderr: err.message, exit_code: -1 };
        }
      },
    }),

    run_single_test: tool({
      description:
        "Run a specific test file or test function. Faster than run_tests for targeted debugging. Automatically detects the framework from the file extension.",
      parameters: z.object({
        test_path: z.string().describe("Path to the test file (e.g. 'tests/test_auth.py', 'src/__tests__/auth.test.ts')"),
        test_name: z.string().describe("Specific test function/case name to run. Use '' to run all tests in the file."),
      }),
      execute: async ({ test_path, test_name }) => {
        try {
          let cmd: string;
          if (test_path.endsWith(".py")) {
            const nameFilter = test_name ? `-k '${test_name}'` : "";
            cmd = `python -m pytest '${test_path}' ${nameFilter} -v --tb=long 2>&1`;
          } else {
            // JS/TS test file
            const nameFilter = test_name ? `-t '${test_name}'` : "";
            cmd = `npx vitest run '${test_path}' ${nameFilter} 2>&1 || npx jest '${test_path}' ${nameFilter} 2>&1`;
          }

          const result = await shellExec(sessionId, cmd, 60000);
          return {
            stdout: result.stdout.slice(0, 16000),
            stderr: result.stderr.slice(0, 4000),
            exit_code: result.exitCode,
          };
        } catch (err: any) {
          return { stdout: "", stderr: err.message, exit_code: -1 };
        }
      },
    }),

    test_coverage: tool({
      description:
        "Run tests with code coverage reporting. Shows which lines/branches are covered and the overall coverage percentage. Uses pytest-cov for Python.",
      parameters: z.object({
        directory: z.string().describe("Project root directory"),
        source_dir: z.string().describe("Source directory to measure coverage for (e.g. 'src', 'app', '.'). Use '.' if unsure."),
      }),
      execute: async ({ directory, source_dir }) => {
        try {
          // Detect project type
          const detectResult = await shellExec(
            sessionId,
            `cd '${directory}' && (test -f package.json && echo 'node') || echo 'python'`,
            5000,
          );
          const projectType = detectResult.stdout.trim();

          let cmd: string;
          if (projectType.includes("node")) {
            cmd = `cd '${directory}' && npx vitest run --coverage 2>&1 || npx jest --coverage 2>&1`;
          } else {
            cmd = `cd '${directory}' && python -m pytest --cov='${source_dir}' --cov-report=term-missing --tb=short 2>&1`;
          }

          const result = await shellExec(sessionId, cmd, 120000);
          return {
            stdout: result.stdout.slice(0, 16000),
            stderr: result.stderr.slice(0, 4000),
            exit_code: result.exitCode,
          };
        } catch (err: any) {
          return { stdout: "", stderr: err.message, exit_code: -1 };
        }
      },
    }),

    // ===== Project-Aware Tools =====

    project_structure: tool({
      description:
        "Analyze a project's structure and technology stack. Returns a tree visualization, file counts by type, and key project metadata from package.json / pyproject.toml. Use this to quickly understand any codebase.",
      parameters: z.object({
        directory: z.string().describe("Project root directory to analyze"),
        depth: z.string().describe("Tree depth. Use '3' for overview, '5' for detailed view."),
      }),
      execute: async ({ directory, depth }) => {
        try {
          const d = parseInt(depth, 10) || 3;
          const treeCmd = `cd '${directory}' && tree -L ${d} --dirsfirst -I 'node_modules|.git|__pycache__|.venv|env|dist|build|.next' 2>/dev/null || find . -maxdepth ${d} -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/__pycache__/*' | head -100`;

          const [treeResult, statsResult, configResult] = await Promise.all([
            shellExec(sessionId, treeCmd, 10000),
            shellExec(sessionId, `cd '${directory}' && find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/__pycache__/*' | sed 's/.*\\.//' | sort | uniq -c | sort -rn | head -20`, 10000),
            shellExec(sessionId, `cd '${directory}' && (cat package.json 2>/dev/null || cat pyproject.toml 2>/dev/null || echo '{}') | head -60`, 5000),
          ]);

          return {
            tree: treeResult.stdout.slice(0, 8000),
            file_types: statsResult.stdout.slice(0, 2000),
            project_config: configResult.stdout.slice(0, 4000),
          };
        } catch (err: any) {
          return { tree: "", file_types: "", project_config: "", error: err.message };
        }
      },
    }),

    install_dependencies: tool({
      description:
        "Install project dependencies. Auto-detects the package manager from project files: npm/pnpm for Node.js, pip for Python. Run this after cloning a repo to set up the development environment.",
      parameters: z.object({
        directory: z.string().describe("Project root directory"),
        extra: z.string().describe("Extra arguments for the package manager (e.g. '--dev' for pip, '--legacy-peer-deps' for npm). Use '' for defaults."),
      }),
      execute: async ({ directory, extra }) => {
        try {
          // Detect package manager
          const detectResult = await shellExec(
            sessionId,
            `cd '${directory}' && (test -f pnpm-lock.yaml && echo 'pnpm') || (test -f yarn.lock && echo 'yarn') || (test -f package-lock.json && echo 'npm') || (test -f package.json && echo 'npm') || (test -f requirements.txt && echo 'pip-req') || (test -f pyproject.toml && echo 'pip-pyproject') || echo 'unknown'`,
            5000,
          );
          const manager = detectResult.stdout.trim().split("\n").pop() ?? "unknown";

          let cmd: string;
          switch (manager) {
            case "pnpm":
              cmd = `cd '${directory}' && pnpm install ${extra}`;
              break;
            case "yarn":
              cmd = `cd '${directory}' && yarn install ${extra}`;
              break;
            case "npm":
              cmd = `cd '${directory}' && npm install ${extra}`;
              break;
            case "pip-req":
              cmd = `cd '${directory}' && pip install -r requirements.txt ${extra}`;
              break;
            case "pip-pyproject":
              cmd = `cd '${directory}' && pip install -e '.[dev]' ${extra} 2>/dev/null || pip install -e . ${extra}`;
              break;
            default:
              return { stdout: "", stderr: `No recognized package manager in '${directory}'.`, exit_code: -1 };
          }

          const result = await shellExec(sessionId, cmd, 180000);
          return {
            manager,
            stdout: result.stdout.slice(0, 8000),
            stderr: result.stderr.slice(0, 4000),
            exit_code: result.exitCode,
          };
        } catch (err: any) {
          return { manager: "unknown", stdout: "", stderr: err.message, exit_code: -1 };
        }
      },
    }),

    // ===== Browser Automation Tools =====

    browser_navigate: tool({
      description:
        "Navigate to a URL in an isolated browser. Use this to visit web pages, web apps, or documentation sites for inspection. The browser persists across calls in the same session. SSRF-protected: private/internal IPs are blocked.",
      parameters: z.object({
        url: z.string().describe("Full URL to navigate to (must be http:// or https://)"),
      }),
      execute: async ({ url }) => {
        try {
          const result = await navigateTo(sessionId, url);
          return {
            status: "navigated",
            url: result.url,
            title: result.title,
            http_status: result.status,
          };
        } catch (err: any) {
          return { status: "error", message: err.message };
        }
      },
    }),

    browser_snapshot: tool({
      description:
        "Get a text snapshot of the current browser page using the accessibility tree. This returns a structured text representation of the page that you can reason about — headings, links, buttons, form fields, text content. Much more useful than raw HTML for understanding page content.",
      parameters: z.object({}),
      execute: async () => {
        try {
          const result = await getPageSnapshot(sessionId);
          return {
            url: result.url,
            title: result.title,
            snapshot: result.snapshot,
          };
        } catch (err: any) {
          return { url: "", title: "", snapshot: "", error: err.message };
        }
      },
    }),

    browser_screenshot: tool({
      description:
        "Take a PNG screenshot of the current browser page. Returns a base64-encoded image. Use browser_snapshot first for text-based analysis — use this only when visual layout matters.",
      parameters: z.object({}),
      execute: async () => {
        try {
          const base64 = await screenshotPage(sessionId);
          return {
            status: "ok",
            format: "png",
            base64,
            size_bytes: Math.ceil(base64.length * 0.75),
          };
        } catch (err: any) {
          return { status: "error", message: err.message };
        }
      },
    }),

    browser_click: tool({
      description:
        "Click an element on the current browser page. Use a CSS selector to target the element. Use browser_snapshot first to identify available elements and their selectors.",
      parameters: z.object({
        selector: z.string().describe("CSS selector for the element to click (e.g. 'button.submit', '#login-btn', 'a[href=\"/about\"]')"),
      }),
      execute: async ({ selector }) => {
        try {
          await clickElement(sessionId, selector);
          return { status: "clicked", selector };
        } catch (err: any) {
          return { status: "error", selector, message: err.message };
        }
      },
    }),

    browser_type: tool({
      description:
        "Type text into an input field on the current browser page. Clears the field first, then types the new value. Use browser_snapshot to identify input field selectors.",
      parameters: z.object({
        selector: z.string().describe("CSS selector for the input field (e.g. '#email', 'input[name=\"search\"]')"),
        text: z.string().describe("Text to type into the field"),
      }),
      execute: async ({ selector, text }) => {
        try {
          await typeText(sessionId, selector, text);
          return { status: "typed", selector, length: text.length };
        } catch (err: any) {
          return { status: "error", selector, message: err.message };
        }
      },
    }),

    browser_evaluate: tool({
      description:
        "Execute JavaScript in the browser page context. Use for extracting specific data, checking element properties, or reading page state. Returns the evaluation result as JSON.",
      parameters: z.object({
        script: z.string().describe("JavaScript expression or code to evaluate in the page (e.g. 'document.title', 'document.querySelectorAll(\"a\").length')"),
      }),
      execute: async ({ script }) => {
        try {
          const result = await evaluateScript(sessionId, script);
          return { status: "ok", result };
        } catch (err: any) {
          return { status: "error", message: err.message };
        }
      },
    }),

    browser_close: tool({
      description:
        "Close the browser tab for this session. Use when you're done browsing to free resources. A new tab will be created automatically if you navigate again.",
      parameters: z.object({}),
      execute: async () => {
        try {
          await closePage(sessionId);
          return { status: "closed" };
        } catch (err: any) {
          return { status: "error", message: err.message };
        }
      },
    }),

    // ===== Secret Store =====

    get_secret: tool({
      description:
        "Retrieve a secret (API key, password, token) from the encrypted secret store by name. Use this instead of asking the user for credentials. Only secrets whose allowed_tools list includes the calling tool (or secrets with no restrictions) will be returned.",
      parameters: z.object({
        name: z.string().describe("The name of the secret to retrieve (e.g. 'OPENAI_API_KEY', 'github_token')"),
      }),
      execute: async ({ name }) => {
        try {
          const value = await getSecretValue(name, "get_secret");
          return { status: "ok", name, value };
        } catch (err: any) {
          return { status: "error", name, message: err.message };
        }
      },
    }),

    generate_image: tool({
      description:
        "Generate an image from a text prompt using DALL-E. The image is saved to the sandbox workspace and can be served or downloaded. " +
        "Use this when the user asks you to create, generate, draw, or design an image, picture, logo, illustration, etc. " +
        "Returns the file path in the workspace and a base64-encoded preview.",
      parameters: z.object({
        prompt: z.string().describe("Detailed description of the image to generate. Be specific about style, content, colors, composition."),
        size: z
          .enum(["256x256", "512x512", "1024x1024"])
          .describe("Image dimensions. Use '1024x1024' for high quality, '512x512' for normal, '256x256' for quick/small."),
        filename: z
          .string()
          .describe("Output filename in the workspace (e.g. 'generated-logo.png', 'diagram.png'). Must end in .png"),
      }),
      execute: async ({ prompt, size, filename }) => {
        try {
          const apiKey = config.OPENAI_API_KEY;
          if (!apiKey) {
            return { status: "error", message: "OPENAI_API_KEY is not configured on the server." };
          }

          const response = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "dall-e-2",
              prompt,
              n: 1,
              size,
              response_format: "b64_json",
            }),
            signal: AbortSignal.timeout(60000),
          });

          if (!response.ok) {
            const err = (await response.json()) as Record<string, any>;
            return {
              status: "error",
              message: err.error?.message || `OpenAI API returned ${response.status}`,
            };
          }

          const data = (await response.json()) as { data: Array<{ b64_json: string }> };
          const b64 = data.data[0].b64_json;
          const buf = Buffer.from(b64, "base64");

          // Save to workspace
          const safeName = filename.endsWith(".png") ? filename : `${filename}.png`;
          await writeBinaryInSandbox(sessionId, safeName, buf);

          return {
            status: "ok",
            path: safeName,
            size_bytes: buf.length,
            dimensions: size,
            prompt_used: prompt,
            base64_preview: b64.slice(0, 200) + "...",
            message: `Image saved to workspace as '${safeName}'. Use get_sandbox_file to retrieve the full file.`,
          };
        } catch (err: any) {
          return { status: "error", message: err.message };
        }
      },
    }),

    get_sandbox_file: tool({
      description:
        "Retrieve any file from the sandbox workspace as base64-encoded data. Use this for binary files like images, PDFs, archives, " +
        "audio files, or any generated output that needs to be sent back to the user. " +
        "Returns the file content as a base64 string along with the MIME type. " +
        "For text files, prefer using read_file instead.",
      parameters: z.object({
        path: z
          .string()
          .describe("Relative file path within the sandbox workspace (e.g. 'output.png', 'results/chart.pdf')"),
      }),
      execute: async ({ path: filePath }) => {
        try {
          const result = await readBinaryFromSandbox(sessionId, filePath);

          // Determine MIME type from extension
          const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
          const mimeTypes: Record<string, string> = {
            png: "image/png",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            gif: "image/gif",
            webp: "image/webp",
            svg: "image/svg+xml",
            pdf: "application/pdf",
            zip: "application/zip",
            tar: "application/x-tar",
            gz: "application/gzip",
            mp3: "audio/mpeg",
            wav: "audio/wav",
            ogg: "audio/ogg",
            mp4: "video/mp4",
            json: "application/json",
            csv: "text/csv",
            txt: "text/plain",
          };
          const mime = mimeTypes[ext] ?? "application/octet-stream";

          // Cap output for very large files (10 MB base64 ≈ 7.5 MB raw)
          if (result.base64.length > 10_000_000) {
            return {
              status: "error",
              message: `File is too large to return inline (${result.size} bytes). Use shell_exec to process or compress it first.`,
              size_bytes: result.size,
            };
          }

          return {
            status: "ok",
            path: filePath,
            mime_type: mime,
            size_bytes: result.size,
            base64: result.base64,
          };
        } catch (err: any) {
          return { status: "error", path: filePath, message: err.message };
        }
      },
    }),
  };
}

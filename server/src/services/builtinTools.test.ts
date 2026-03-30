import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock("../config.js", () => ({
  config: {
    KRAKEN_GIT_TOKEN: "ghp_test_token_123",
    KRAKEN_SANDBOX_TIMEOUT_MS: 30000,
  },
}));

const mockExecuteCode = vi.fn();
const mockShellExec = vi.fn();
const mockWriteFileInSandbox = vi.fn();
const mockReadFileFromSandbox = vi.fn();
const mockListFilesInSandbox = vi.fn();
const mockAddPortForward = vi.fn();
const mockRemovePortForward = vi.fn();
const mockGetPortForwards = vi.fn();
const mockExecBackground = vi.fn();
const mockReadProcessLog = vi.fn();
const mockListProcesses = vi.fn();
const mockKillProcess = vi.fn();
const mockGetSandboxInfo = vi.fn();

vi.mock("./sandbox.js", () => ({
  executeCode: (...args: unknown[]) => mockExecuteCode(...args),
  shellExec: (...args: unknown[]) => mockShellExec(...args),
  writeFileInSandbox: (...args: unknown[]) => mockWriteFileInSandbox(...args),
  readFileFromSandbox: (...args: unknown[]) => mockReadFileFromSandbox(...args),
  listFilesInSandbox: (...args: unknown[]) => mockListFilesInSandbox(...args),
  addPortForward: (...args: unknown[]) => mockAddPortForward(...args),
  removePortForward: (...args: unknown[]) => mockRemovePortForward(...args),
  getPortForwards: (...args: unknown[]) => mockGetPortForwards(...args),
  execBackground: (...args: unknown[]) => mockExecBackground(...args),
  readProcessLog: (...args: unknown[]) => mockReadProcessLog(...args),
  listProcesses: (...args: unknown[]) => mockListProcesses(...args),
  killProcess: (...args: unknown[]) => mockKillProcess(...args),
  getSandboxInfo: (...args: unknown[]) => mockGetSandboxInfo(...args),
}));

const mockNavigateTo = vi.fn();
const mockGetPageSnapshot = vi.fn();
const mockScreenshotPage = vi.fn();
const mockClickElement = vi.fn();
const mockTypeText = vi.fn();
const mockEvaluateScript = vi.fn();
const mockClosePage = vi.fn();

vi.mock("./browser.js", () => ({
  navigateTo: (...args: unknown[]) => mockNavigateTo(...args),
  getPageSnapshot: (...args: unknown[]) => mockGetPageSnapshot(...args),
  screenshotPage: (...args: unknown[]) => mockScreenshotPage(...args),
  clickElement: (...args: unknown[]) => mockClickElement(...args),
  typeText: (...args: unknown[]) => mockTypeText(...args),
  evaluateScript: (...args: unknown[]) => mockEvaluateScript(...args),
  closePage: (...args: unknown[]) => mockClosePage(...args),
}));

const mockStoreExplicitMemory = vi.fn();
const mockRecallMemories = vi.fn();

vi.mock("./memory.js", () => ({
  storeExplicitMemory: (...args: unknown[]) => mockStoreExplicitMemory(...args),
  recallMemories: (...args: unknown[]) => mockRecallMemories(...args),
}));

const mockListTools = vi.fn();
const mockCreateTool = vi.fn();

vi.mock("./tools.js", () => ({
  listTools: (...args: unknown[]) => mockListTools(...args),
  createTool: (...args: unknown[]) => mockCreateTool(...args),
}));

const mockGetRelevantSkills = vi.fn();
const mockCreateSkill = vi.fn();

vi.mock("./skills.js", () => ({
  getRelevantSkills: (...args: unknown[]) => mockGetRelevantSkills(...args),
  createSkill: (...args: unknown[]) => mockCreateSkill(...args),
}));

const mockCreateSchedule = vi.fn();
const mockCreateOneTimeSchedule = vi.fn();
const mockListSchedules = vi.fn();
const mockDeleteSchedule = vi.fn();

vi.mock("./schedules.js", () => ({
  createSchedule: (...args: unknown[]) => mockCreateSchedule(...args),
  createOneTimeSchedule: (...args: unknown[]) => mockCreateOneTimeSchedule(...args),
  listSchedules: (...args: unknown[]) => mockListSchedules(...args),
  deleteSchedule: (...args: unknown[]) => mockDeleteSchedule(...args),
}));

// ── Test setup ─────────────────────────────────────────────────────────

import { getBuiltinTools } from "./builtinTools.js";

const SESSION_ID = "test-session-123";

// Helper to call a tool's execute function
function exec(toolName: string, args: Record<string, unknown>) {
  const tools = getBuiltinTools(SESSION_ID);
  const t = (tools as Record<string, any>)[toolName];
  if (!t) throw new Error(`Tool '${toolName}' not found`);
  return t.execute(args);
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────

describe("getBuiltinTools", () => {
  it("returns an object with all expected tools", () => {
    const tools = getBuiltinTools(SESSION_ID);
    const names = Object.keys(tools);

    expect(names).toContain("web_search");
    expect(names).toContain("fetch_url");
    expect(names).toContain("store_memory");
    expect(names).toContain("recall_memory");
    expect(names).toContain("search_tools");
    expect(names).toContain("search_skills");
    expect(names).toContain("create_tool");
    expect(names).toContain("create_skill");
    expect(names).toContain("create_schedule");
    expect(names).toContain("schedule_once");
    expect(names).toContain("list_schedules");
    expect(names).toContain("cancel_schedule");
    expect(names).toContain("execute_code");
    expect(names).toContain("shell_exec");
    expect(names).toContain("write_file");
    expect(names).toContain("read_file");
    expect(names).toContain("list_workspace_files");
    expect(names).toContain("background_exec");
    expect(names).toContain("read_process_log");
    expect(names).toContain("list_processes");
    expect(names).toContain("kill_process");
    expect(names).toContain("port_forward");
    expect(names).toContain("remove_port_forward");
    expect(names).toContain("sandbox_status");
    expect(names).toContain("git_clone");
    expect(names).toContain("git_status");
    expect(names).toContain("git_diff");
    expect(names).toContain("git_log");
    expect(names).toContain("git_commit");
    expect(names).toContain("git_branch");
    expect(names).toContain("git_patch");
    expect(names).toContain("git_push");
    expect(names).toContain("github_create_pr");
    expect(names).toContain("github_list_prs");
    expect(names).toContain("github_get_file");
    expect(names).toContain("github_list_files");
    expect(names).toContain("search_code");
    expect(names).toContain("run_linter");
    expect(names).toContain("file_diff");
    expect(names).toContain("run_tests");
    expect(names).toContain("run_single_test");
    expect(names).toContain("test_coverage");
    expect(names).toContain("project_structure");
    expect(names).toContain("install_dependencies");
    expect(names).toContain("browser_navigate");
    expect(names).toContain("browser_snapshot");
    expect(names).toContain("browser_screenshot");
    expect(names).toContain("browser_click");
    expect(names).toContain("browser_type");
    expect(names).toContain("browser_evaluate");
    expect(names).toContain("browser_close");
  });
});

// ── Memory Tools ───────────────────────────────────────────────────────

describe("store_memory", () => {
  it("stores a fact and returns confirmation", async () => {
    mockStoreExplicitMemory.mockResolvedValue({ id: "mem-1", fact: "User likes cats" });

    const result = await exec("store_memory", {
      fact: "User likes cats",
      tags: ["preference", "pets"],
    });

    expect(result.stored).toBe(true);
    expect(result.id).toBe("mem-1");
    expect(result.fact).toBe("User likes cats");
    expect(mockStoreExplicitMemory).toHaveBeenCalledWith(SESSION_ID, "User likes cats", ["preference", "pets"]);
  });
});

describe("recall_memory", () => {
  it("returns matching memories", async () => {
    mockRecallMemories.mockResolvedValue([
      { content: "User likes cats", type: "explicit", timestamp: "2026-01-01T00:00:00Z" },
    ]);

    const result = await exec("recall_memory", { query: "pets" });

    expect(result.found).toBe(1);
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].content).toBe("User likes cats");
    expect(mockRecallMemories).toHaveBeenCalledWith("pets", 10);
  });

  it("returns empty when no memories found", async () => {
    mockRecallMemories.mockResolvedValue([]);

    const result = await exec("recall_memory", { query: "nonexistent" });

    expect(result.found).toBe(0);
    expect(result.memories).toEqual([]);
  });
});

// ── Tool Registry ──────────────────────────────────────────────────────

describe("search_tools", () => {
  it("returns matching tools", async () => {
    mockListTools.mockResolvedValue({
      tools: [
        { name: "api_tool", description: "Makes API calls", instructions: "Use it", tags: ["api"] },
      ],
    });

    const result = await exec("search_tools", { query: "api" });

    expect(result.found).toBe(1);
    expect(result.tools[0].name).toBe("api_tool");
    expect(mockListTools).toHaveBeenCalledWith({ search: "api", limit: 10 });
  });

  it("returns empty message when no tools found", async () => {
    mockListTools.mockResolvedValue({ tools: [] });

    const result = await exec("search_tools", { query: "nonexistent" });

    expect(result.found).toBe(0);
    expect(result.tools).toEqual([]);
  });
});

describe("create_tool", () => {
  it("creates a tool and returns confirmation", async () => {
    mockCreateTool.mockResolvedValue({ id: "tool-1", name: "my_tool", description: "Does stuff" });

    const result = await exec("create_tool", {
      name: "my_tool",
      description: "Does stuff",
      instructions: "Step 1: ...",
      tags: "api, web, search",
    });

    expect(result.status).toBe("created");
    expect(result.id).toBe("tool-1");
    expect(mockCreateTool).toHaveBeenCalledWith({
      name: "my_tool",
      description: "Does stuff",
      instructions: "Step 1: ...",
      tags: ["api", "web", "search"],
    });
  });
});

// ── Skills ─────────────────────────────────────────────────────────────

describe("search_skills", () => {
  it("returns matching skills", async () => {
    mockGetRelevantSkills.mockResolvedValue([
      { name: "OAuth2", content: "...", tags: ["auth"] },
    ]);

    const result = await exec("search_skills", { query: "auth" });

    expect(result.found).toBe(1);
    expect(result.skills[0].name).toBe("OAuth2");
  });

  it("returns empty when no skills found", async () => {
    mockGetRelevantSkills.mockResolvedValue([]);

    const result = await exec("search_skills", { query: "nope" });

    expect(result.found).toBe(0);
  });
});

describe("create_skill", () => {
  it("creates a skill and returns confirmation", async () => {
    mockCreateSkill.mockResolvedValue({ id: "skill-1", name: "Deploy API" });

    const result = await exec("create_skill", {
      name: "Deploy API",
      content: "Step 1: ...",
      tags: "deploy,api",
    });

    expect(result.status).toBe("created");
    expect(result.id).toBe("skill-1");
    expect(mockCreateSkill).toHaveBeenCalledWith({
      name: "Deploy API",
      content: "Step 1: ...",
      tags: ["deploy", "api"],
    });
  });
});

// ── Schedule Tools ─────────────────────────────────────────────────────

describe("create_schedule", () => {
  it("creates a recurring schedule", async () => {
    mockCreateSchedule.mockResolvedValue({
      id: "sched-1",
      name: "Daily report",
      cron_expression: "0 9 * * *",
      next_run_at: "2026-03-31T09:00:00Z",
    });

    const result = await exec("create_schedule", {
      name: "Daily report",
      task_prompt: "Generate report",
      cron_expression: "0 9 * * *",
      origin_session_id: SESSION_ID,
      max_runs: "10",
    });

    expect(result.status).toBe("created");
    expect(result.id).toBe("sched-1");
    expect(mockCreateSchedule).toHaveBeenCalledWith({
      name: "Daily report",
      taskPrompt: "Generate report",
      cronExpression: "0 9 * * *",
      originSessionId: SESSION_ID,
      maxRuns: 10,
    });
  });

  it("passes undefined for max_runs=0 (unlimited)", async () => {
    mockCreateSchedule.mockResolvedValue({
      id: "sched-2",
      name: "Unlimited",
      cron_expression: "*/5 * * * *",
      next_run_at: "2026-03-30T00:05:00Z",
    });

    await exec("create_schedule", {
      name: "Unlimited",
      task_prompt: "Check things",
      cron_expression: "*/5 * * * *",
      origin_session_id: "",
      max_runs: "0",
    });

    expect(mockCreateSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ maxRuns: undefined, originSessionId: undefined }),
    );
  });

  it("returns error on failure", async () => {
    mockCreateSchedule.mockRejectedValue(new Error("Invalid cron"));

    const result = await exec("create_schedule", {
      name: "Bad",
      task_prompt: "x",
      cron_expression: "bad",
      origin_session_id: "",
      max_runs: "0",
    });

    expect(result.status).toBe("error");
    expect(result.message).toBe("Invalid cron");
  });
});

describe("schedule_once", () => {
  it("creates a one-time schedule", async () => {
    mockCreateOneTimeSchedule.mockResolvedValue({
      id: "sched-once-1",
      name: "Reminder",
      next_run_at: "2026-03-30T17:00:00Z",
    });

    const result = await exec("schedule_once", {
      name: "Reminder",
      task_prompt: "Remind user about meeting",
      run_at: "2026-03-30T17:00:00Z",
      origin_session_id: SESSION_ID,
    });

    expect(result.status).toBe("scheduled");
    expect(result.id).toBe("sched-once-1");
  });

  it("returns error for invalid date", async () => {
    const result = await exec("schedule_once", {
      name: "Bad",
      task_prompt: "x",
      run_at: "not-a-date",
      origin_session_id: "",
    });

    expect(result.status).toBe("error");
    expect(result.message).toContain("Invalid date");
  });
});

describe("list_schedules", () => {
  it("returns all schedules", async () => {
    mockListSchedules.mockResolvedValue({
      schedules: [
        {
          id: "sched-1",
          name: "Daily",
          cron_expression: "0 9 * * *",
          enabled: true,
          run_count: 5,
          max_runs: null,
          next_run_at: "2026-03-31T09:00:00Z",
          last_run_at: "2026-03-30T09:00:00Z",
        },
      ],
    });

    const result = await exec("list_schedules", { query: "all" });

    expect(result.found).toBe(1);
    expect(result.schedules[0].name).toBe("Daily");
  });

  it("returns empty when no schedules", async () => {
    mockListSchedules.mockResolvedValue({ schedules: [] });

    const result = await exec("list_schedules", { query: "all" });

    expect(result.found).toBe(0);
    expect(result.schedules).toEqual([]);
  });
});

describe("cancel_schedule", () => {
  it("returns deleted status when found", async () => {
    mockDeleteSchedule.mockResolvedValue(true);

    const result = await exec("cancel_schedule", { schedule_id: "sched-1" });

    expect(result.status).toBe("deleted");
    expect(mockDeleteSchedule).toHaveBeenCalledWith("sched-1");
  });

  it("returns not_found when schedule doesn't exist", async () => {
    mockDeleteSchedule.mockResolvedValue(false);

    const result = await exec("cancel_schedule", { schedule_id: "nonexistent" });

    expect(result.status).toBe("not_found");
  });
});

// ── Sandbox Execution Tools ────────────────────────────────────────────

describe("execute_code", () => {
  it("executes Python code and returns output", async () => {
    mockExecuteCode.mockResolvedValue({ stdout: "42\n", stderr: "", exitCode: 0 });

    const result = await exec("execute_code", { code: "print(42)", timeout_ms: "30000" });

    expect(result.stdout).toBe("42\n");
    expect(result.stderr).toBe("");
    expect(result.exit_code).toBe(0);
    expect(mockExecuteCode).toHaveBeenCalledWith(SESSION_ID, "print(42)", 30000);
  });

  it("truncates long stdout to 16000 chars", async () => {
    mockExecuteCode.mockResolvedValue({
      stdout: "x".repeat(20000),
      stderr: "",
      exitCode: 0,
    });

    const result = await exec("execute_code", { code: "print('x'*20000)", timeout_ms: "30000" });

    expect(result.stdout).toHaveLength(16000);
  });

  it("truncates long stderr to 4000 chars", async () => {
    mockExecuteCode.mockResolvedValue({
      stdout: "",
      stderr: "e".repeat(5000),
      exitCode: 1,
    });

    const result = await exec("execute_code", { code: "bad", timeout_ms: "30000" });

    expect(result.stderr).toHaveLength(4000);
  });

  it("returns error when execution throws", async () => {
    mockExecuteCode.mockRejectedValue(new Error("Execution timed out"));

    const result = await exec("execute_code", { code: "while True: pass", timeout_ms: "5000" });

    expect(result.exit_code).toBe(-1);
    expect(result.stderr).toBe("Execution timed out");
  });

  it("passes undefined for invalid timeout_ms", async () => {
    mockExecuteCode.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await exec("execute_code", { code: "pass", timeout_ms: "invalid" });

    expect(mockExecuteCode).toHaveBeenCalledWith(SESSION_ID, "pass", undefined);
  });
});

describe("shell_exec", () => {
  it("executes shell command and returns output", async () => {
    mockShellExec.mockResolvedValue({ stdout: "hello\n", stderr: "", exitCode: 0 });

    const result = await exec("shell_exec", { command: "echo hello", timeout_ms: "30000" });

    expect(result.stdout).toBe("hello\n");
    expect(result.exit_code).toBe(0);
    expect(mockShellExec).toHaveBeenCalledWith(SESSION_ID, "echo hello", 30000);
  });

  it("returns error when command throws", async () => {
    mockShellExec.mockRejectedValue(new Error("Container not found"));

    const result = await exec("shell_exec", { command: "ls", timeout_ms: "5000" });

    expect(result.exit_code).toBe(-1);
    expect(result.stderr).toBe("Container not found");
  });
});

// ── File Tools ─────────────────────────────────────────────────────────

describe("write_file", () => {
  it("writes a file and returns status", async () => {
    mockWriteFileInSandbox.mockResolvedValue(undefined);

    const result = await exec("write_file", { path: "main.py", content: "print('hi')" });

    expect(result.status).toBe("written");
    expect(result.path).toBe("main.py");
    expect(result.size).toBe(11);
    expect(mockWriteFileInSandbox).toHaveBeenCalledWith(SESSION_ID, "main.py", "print('hi')");
  });

  it("returns error on path traversal", async () => {
    mockWriteFileInSandbox.mockRejectedValue(new Error("Path traversal detected"));

    const result = await exec("write_file", { path: "../../etc/passwd", content: "bad" });

    expect(result.status).toBe("error");
    expect(result.message).toBe("Path traversal detected");
  });
});

describe("read_file", () => {
  it("reads a file and returns contents", async () => {
    mockReadFileFromSandbox.mockResolvedValue("print('hi')");

    const result = await exec("read_file", { path: "main.py" });

    expect(result.status).toBe("ok");
    expect(result.content).toBe("print('hi')");
    expect(result.size).toBe(11);
    expect(mockReadFileFromSandbox).toHaveBeenCalledWith(SESSION_ID, "main.py");
  });

  it("truncates large file content", async () => {
    mockReadFileFromSandbox.mockResolvedValue("x".repeat(20000));

    const result = await exec("read_file", { path: "big.txt" });

    expect(result.content).toContain("[...truncated]");
    expect(result.content.length).toBeLessThanOrEqual(16020);
    expect(result.size).toBe(20000);
  });

  it("returns error for missing file", async () => {
    mockReadFileFromSandbox.mockRejectedValue(new Error("ENOENT"));

    const result = await exec("read_file", { path: "missing.txt" });

    expect(result.status).toBe("error");
  });
});

describe("list_workspace_files", () => {
  it("lists files in the workspace", async () => {
    mockListFilesInSandbox.mockResolvedValue([
      { name: "main.py", type: "file", size: 100 },
      { name: "data", type: "directory", size: 4096 },
    ]);

    const result = await exec("list_workspace_files", { directory: "." });

    expect(result.status).toBe("ok");
    expect(result.files).toHaveLength(2);
    expect(result.directory).toBe(".");
  });

  it("passes undefined for empty directory", async () => {
    mockListFilesInSandbox.mockResolvedValue([]);

    await exec("list_workspace_files", { directory: "" });

    expect(mockListFilesInSandbox).toHaveBeenCalledWith(SESSION_ID, undefined);
  });

  it("returns error with empty files array", async () => {
    mockListFilesInSandbox.mockRejectedValue(new Error("Not a directory"));

    const result = await exec("list_workspace_files", { directory: "file.txt" });

    expect(result.status).toBe("error");
    expect(result.files).toEqual([]);
  });
});

// ── Background Process & Port Forwarding ───────────────────────────────

describe("background_exec", () => {
  it("starts a background process and returns PID", async () => {
    mockExecBackground.mockResolvedValue({ pid: 42, logFile: "/tmp/bg-123.log" });

    const result = await exec("background_exec", {
      command: "python -m http.server 8000",
      log_file: "",
    });

    expect(result.status).toBe("started");
    expect(result.pid).toBe(42);
    expect(result.log_file).toBe("/tmp/bg-123.log");
    expect(mockExecBackground).toHaveBeenCalledWith(SESSION_ID, "python -m http.server 8000", undefined);
  });

  it("passes custom log file path", async () => {
    mockExecBackground.mockResolvedValue({ pid: 99, logFile: "/tmp/server.log" });

    await exec("background_exec", {
      command: "npm start",
      log_file: "/tmp/server.log",
    });

    expect(mockExecBackground).toHaveBeenCalledWith(SESSION_ID, "npm start", "/tmp/server.log");
  });

  it("returns error on failure", async () => {
    mockExecBackground.mockRejectedValue(new Error("Failed to start"));

    const result = await exec("background_exec", { command: "bad", log_file: "" });

    expect(result.status).toBe("error");
    expect(result.message).toBe("Failed to start");
  });
});

describe("read_process_log", () => {
  it("reads background process log", async () => {
    mockReadProcessLog.mockResolvedValue("Server started on :8000\nRequest from 127.0.0.1\n");

    const result = await exec("read_process_log", {
      log_file: "/tmp/bg-123.log",
      lines: "50",
    });

    expect(result.status).toBe("ok");
    expect(result.output).toContain("Server started");
    expect(mockReadProcessLog).toHaveBeenCalledWith(SESSION_ID, "/tmp/bg-123.log", 50);
  });

  it("defaults to 50 lines for invalid input", async () => {
    mockReadProcessLog.mockResolvedValue("line\n");

    await exec("read_process_log", { log_file: "/tmp/x.log", lines: "invalid" });

    expect(mockReadProcessLog).toHaveBeenCalledWith(SESSION_ID, "/tmp/x.log", 50);
  });

  it("returns error for missing log file", async () => {
    mockReadProcessLog.mockRejectedValue(new Error("No such file"));

    const result = await exec("read_process_log", { log_file: "/tmp/missing.log", lines: "10" });

    expect(result.status).toBe("error");
  });
});

describe("list_processes", () => {
  it("lists running processes", async () => {
    mockListProcesses.mockResolvedValue("USER  PID %CPU\nsandbox 1  0.0 sleep infinity\n");

    const result = await exec("list_processes", { query: "all" });

    expect(result.status).toBe("ok");
    expect(result.processes).toContain("PID");
  });

  it("returns error when sandbox not running", async () => {
    mockListProcesses.mockRejectedValue(new Error("Container not found"));

    const result = await exec("list_processes", { query: "all" });

    expect(result.status).toBe("error");
  });
});

describe("kill_process", () => {
  it("kills a process by PID", async () => {
    mockKillProcess.mockResolvedValue({ success: true, output: "" });

    const result = await exec("kill_process", { pid: "42", signal: "TERM" });

    expect(result.status).toBe("killed");
    expect(result.pid).toBe(42);
    expect(mockKillProcess).toHaveBeenCalledWith(SESSION_ID, 42, "TERM");
  });

  it("defaults to TERM signal when empty", async () => {
    mockKillProcess.mockResolvedValue({ success: true, output: "" });

    await exec("kill_process", { pid: "42", signal: "" });

    expect(mockKillProcess).toHaveBeenCalledWith(SESSION_ID, 42, "TERM");
  });

  it("returns error for invalid PID", async () => {
    const result = await exec("kill_process", { pid: "abc", signal: "TERM" });

    expect(result.status).toBe("error");
    expect(result.message).toBe("Invalid PID");
    expect(mockKillProcess).not.toHaveBeenCalled();
  });

  it("returns error status when kill fails", async () => {
    mockKillProcess.mockResolvedValue({ success: false, output: "No such process" });

    const result = await exec("kill_process", { pid: "999", signal: "KILL" });

    expect(result.status).toBe("error");
    expect(result.output).toBe("No such process");
  });
});

describe("port_forward", () => {
  it("forwards a container port to host", async () => {
    mockAddPortForward.mockResolvedValue({ containerPort: 8000, hostPort: 30001 });

    const result = await exec("port_forward", { container_port: "8000", host_port: "" });

    expect(result.status).toBe("forwarded");
    expect(result.container_port).toBe(8000);
    expect(result.host_port).toBe(30001);
    expect(mockAddPortForward).toHaveBeenCalledWith(SESSION_ID, 8000, undefined);
  });

  it("passes preferred host port when specified", async () => {
    mockAddPortForward.mockResolvedValue({ containerPort: 3000, hostPort: 30050 });

    await exec("port_forward", { container_port: "3000", host_port: "30050" });

    expect(mockAddPortForward).toHaveBeenCalledWith(SESSION_ID, 3000, 30050);
  });

  it("returns error for invalid container port", async () => {
    const result = await exec("port_forward", { container_port: "abc", host_port: "" });

    expect(result.status).toBe("error");
    expect(result.message).toBe("Invalid container port");
    expect(mockAddPortForward).not.toHaveBeenCalled();
  });

  it("returns error for out-of-range port", async () => {
    const result = await exec("port_forward", { container_port: "0", host_port: "" });

    expect(result.status).toBe("error");
    expect(result.message).toBe("Invalid container port");
  });

  it("returns error for port > 65535", async () => {
    const result = await exec("port_forward", { container_port: "70000", host_port: "" });

    expect(result.status).toBe("error");
    expect(result.message).toBe("Invalid container port");
  });
});

describe("remove_port_forward", () => {
  it("removes an active port forward", async () => {
    mockRemovePortForward.mockResolvedValue(true);

    const result = await exec("remove_port_forward", { container_port: "8000" });

    expect(result.status).toBe("removed");
    expect(result.container_port).toBe(8000);
  });

  it("returns not_found when forward doesn't exist", async () => {
    mockRemovePortForward.mockResolvedValue(false);

    const result = await exec("remove_port_forward", { container_port: "9999" });

    expect(result.status).toBe("not_found");
  });
});

describe("sandbox_status", () => {
  it("returns sandbox info when running", async () => {
    mockGetSandboxInfo.mockResolvedValue({
      sessionId: SESSION_ID,
      containerId: "abc123def456",
      status: "running",
      created: "2026-03-30T00:00:00Z",
      ports: [{ containerPort: 8000, hostPort: 30001 }],
      memoryLimitMB: 256,
      image: "kraken-sandbox:latest",
    });

    const result = await exec("sandbox_status", { query: "all" });

    expect(result.status).toBe("ok");
    expect(result.sandbox.state).toBe("running");
    expect(result.sandbox.forwarded_ports).toHaveLength(1);
    expect(result.sandbox.memory_limit_mb).toBe(256);
  });

  it("returns not_running when no sandbox", async () => {
    mockGetSandboxInfo.mockResolvedValue(null);

    const result = await exec("sandbox_status", { query: "all" });

    expect(result.status).toBe("not_running");
  });
});

// ── Git Tools ──────────────────────────────────────────────────────────

describe("git_clone", () => {
  it("clones a repo with token injection", async () => {
    mockShellExec.mockResolvedValue({ stdout: "Cloning...\n", stderr: "", exitCode: 0 });

    const result = await exec("git_clone", {
      url: "https://github.com/user/repo",
      directory: "repo",
      depth: "1",
      branch: "main",
    });

    expect(result.exit_code).toBe(0);
    // The clone URL should have token injected
    expect(mockShellExec).toHaveBeenCalledWith(
      SESSION_ID,
      expect.stringContaining("x-access-token"),
      120000,
    );
  });

  it("scrubs token from output", async () => {
    mockShellExec.mockResolvedValue({
      stdout: "Cloning into 'repo'...",
      stderr: "fatal: x-access-token:ghp_secret@github.com not found",
      exitCode: 1,
    });

    const result = await exec("git_clone", {
      url: "https://github.com/user/repo",
      directory: "repo",
      depth: "0",
      branch: "",
    });

    expect(result.stderr).not.toContain("ghp_secret");
    expect(result.stderr).toContain("***@");
  });

  it("uses full history when depth=0", async () => {
    mockShellExec.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await exec("git_clone", {
      url: "https://github.com/user/repo",
      directory: "repo",
      depth: "0",
      branch: "",
    });

    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).not.toContain("--depth");
    expect(cmd).not.toContain("--branch");
  });

  it("returns error on exception", async () => {
    mockShellExec.mockRejectedValue(new Error("Docker error"));

    const result = await exec("git_clone", {
      url: "https://github.com/user/repo",
      directory: "repo",
      depth: "1",
      branch: "",
    });

    expect(result.exit_code).toBe(-1);
    expect(result.stderr).toBe("Docker error");
  });
});

describe("git_status", () => {
  it("returns git status output", async () => {
    mockShellExec.mockResolvedValue({
      stdout: "# branch.oid abc123\n# branch.head main\n",
      stderr: "",
      exitCode: 0,
    });

    const result = await exec("git_status", { directory: "repo" });

    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain("branch.head main");
  });
});

describe("git_diff", () => {
  it("shows unstaged diff by default", async () => {
    mockShellExec.mockResolvedValue({ stdout: "diff --git a/file.py", stderr: "", exitCode: 0 });

    const result = await exec("git_diff", {
      directory: "repo",
      mode: "unstaged",
      ref1: "",
      ref2: "",
      path_filter: "",
    });

    expect(result.exit_code).toBe(0);
    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("git diff --stat --patch");
    expect(cmd).not.toContain("--cached");
  });

  it("shows staged diff", async () => {
    mockShellExec.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await exec("git_diff", {
      directory: "repo",
      mode: "staged",
      ref1: "",
      ref2: "",
      path_filter: "",
    });

    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("--cached");
  });

  it("diffs between two refs", async () => {
    mockShellExec.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await exec("git_diff", {
      directory: "repo",
      mode: "refs",
      ref1: "main",
      ref2: "feature",
      path_filter: "",
    });

    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("git diff main feature");
  });

  it("applies path filter", async () => {
    mockShellExec.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await exec("git_diff", {
      directory: "repo",
      mode: "unstaged",
      ref1: "",
      ref2: "",
      path_filter: "src/",
    });

    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("-- 'src/'");
  });
});

describe("git_log", () => {
  it("shows oneline format by default", async () => {
    mockShellExec.mockResolvedValue({ stdout: "abc123 Initial commit\n", stderr: "", exitCode: 0 });

    const result = await exec("git_log", {
      directory: "repo",
      count: "10",
      path_filter: "",
      format: "oneline",
    });

    expect(result.exit_code).toBe(0);
    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("--oneline");
    expect(cmd).toContain("-10");
  });

  it("shows full format with stats", async () => {
    mockShellExec.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await exec("git_log", {
      directory: "repo",
      count: "5",
      path_filter: "",
      format: "full",
    });

    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("--stat");
    expect(cmd).toContain("--date=iso");
  });

  it("defaults count to 20 for invalid input", async () => {
    mockShellExec.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await exec("git_log", {
      directory: "repo",
      count: "invalid",
      path_filter: "",
      format: "oneline",
    });

    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("-20");
  });
});

describe("git_commit", () => {
  it("configures identity, stages files, and commits", async () => {
    mockShellExec.mockResolvedValue({ stdout: "[main abc123] My commit\n", stderr: "", exitCode: 0 });

    const result = await exec("git_commit", {
      directory: "repo",
      message: "My commit",
      files: ".",
    });

    expect(result.exit_code).toBe(0);
    // First call configures git identity
    expect(mockShellExec.mock.calls[0][1]).toContain("git config user.email");
    // Second call does add + commit
    expect(mockShellExec.mock.calls[1][1]).toContain("git add . && git commit");
  });

  it("escapes single quotes in commit message", async () => {
    mockShellExec.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await exec("git_commit", {
      directory: "repo",
      message: "fix: user's bug",
      files: ".",
    });

    const commitCmd = mockShellExec.mock.calls[1][1] as string;
    expect(commitCmd).toContain("user'\\''s bug");
  });
});

describe("git_branch", () => {
  it("lists branches", async () => {
    mockShellExec.mockResolvedValue({ stdout: "* main\n  feature\n", stderr: "", exitCode: 0 });

    const result = await exec("git_branch", {
      directory: "repo",
      action: "list",
      branch_name: "",
    });

    expect(result.exit_code).toBe(0);
    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("git branch -a -vv");
  });

  it("creates a new branch", async () => {
    mockShellExec.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await exec("git_branch", {
      directory: "repo",
      action: "create",
      branch_name: "feature/new",
    });

    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("git checkout -b 'feature/new'");
  });

  it("switches to existing branch", async () => {
    mockShellExec.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await exec("git_branch", {
      directory: "repo",
      action: "switch",
      branch_name: "main",
    });

    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("git checkout 'main'");
    expect(cmd).not.toContain("-b");
  });
});

describe("git_patch", () => {
  it("generates a patch file", async () => {
    mockShellExec.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await exec("git_patch", {
      directory: "repo",
      action: "generate",
      patch_path: "changes.patch",
      ref: "HEAD~3",
    });

    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("git diff HEAD~3 > 'changes.patch'");
  });

  it("applies a patch file", async () => {
    mockShellExec.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await exec("git_patch", {
      directory: "repo",
      action: "apply",
      patch_path: "changes.patch",
      ref: "",
    });

    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("git apply 'changes.patch'");
  });
});

describe("git_push", () => {
  it("pushes with token and restores original URL", async () => {
    // Mock calls in order: get-url, git config, set-url, push, restore-url
    mockShellExec
      .mockResolvedValueOnce({ stdout: "https://github.com/user/repo.git\n", stderr: "", exitCode: 0 }) // get-url
      .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git config
      .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // set-url
      .mockResolvedValueOnce({ stdout: "Pushed\n", stderr: "", exitCode: 0 }) // push
      .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }); // restore

    const result = await exec("git_push", {
      directory: "repo",
      remote: "origin",
      branch: "feature/test",
      force: "false",
      set_upstream: "true",
    });

    expect(result.exit_code).toBe(0);
  });

  it("scrubs token from push output", async () => {
    mockShellExec
      .mockResolvedValueOnce({ stdout: "https://github.com/user/repo.git\n", stderr: "", exitCode: 0 }) // get-url
      .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git config
      .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // set-url
      .mockResolvedValueOnce({
        stdout: "x-access-token:ghp_secret@github.com pushed",
        stderr: "",
        exitCode: 0,
      }) // push
      .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }); // restore

    const result = await exec("git_push", {
      directory: "repo",
      remote: "origin",
      branch: "main",
      force: "false",
      set_upstream: "false",
    });

    expect(result.stdout).not.toContain("ghp_secret");
    expect(result.stdout).toContain("***@");
  });
});

// ── GitHub API Tools ───────────────────────────────────────────────────

describe("github_create_pr", () => {
  it("returns error when no token configured", async () => {
    // Temporarily override config
    const { config: mockConfig } = await import("../config.js");
    const original = mockConfig.KRAKEN_GIT_TOKEN;
    (mockConfig as any).KRAKEN_GIT_TOKEN = undefined;

    const result = await exec("github_create_pr", {
      owner: "user",
      repo: "project",
      title: "Add feature",
      body: "Description",
      head: "feature",
      base: "main",
    });

    expect(result.error).toContain("not configured");
    (mockConfig as any).KRAKEN_GIT_TOKEN = original;
  });
});

describe("github_list_prs", () => {
  it("returns error when no token configured", async () => {
    const { config: mockConfig } = await import("../config.js");
    const original = mockConfig.KRAKEN_GIT_TOKEN;
    (mockConfig as any).KRAKEN_GIT_TOKEN = undefined;

    const result = await exec("github_list_prs", {
      owner: "user",
      repo: "project",
      state: "open",
      head: "",
    });

    expect(result.error).toContain("not configured");
    (mockConfig as any).KRAKEN_GIT_TOKEN = original;
  });
});

// ── Code Review & Analysis Tools ───────────────────────────────────────

describe("search_code", () => {
  it("parses ripgrep JSON output into matches", async () => {
    const rgOutput = [
      JSON.stringify({ type: "match", data: { path: { text: "src/main.py" }, line_number: 10, lines: { text: "def auth():" } } }),
      JSON.stringify({ type: "match", data: { path: { text: "src/utils.py" }, line_number: 5, lines: { text: "import auth" } } }),
    ].join("\n");
    mockShellExec.mockResolvedValue({ stdout: rgOutput, stderr: "", exitCode: 0 });

    const result = await exec("search_code", {
      directory: "repo",
      pattern: "auth",
      file_glob: "*.py",
      context_lines: "0",
    });

    expect(result.found).toBe(2);
    expect(result.matches[0].file).toBe("src/main.py");
    expect(result.matches[0].line).toBe(10);
    expect(result.matches[0].text).toBe("def auth():");
  });

  it("returns no results when ripgrep finds nothing", async () => {
    mockShellExec.mockResolvedValue({ stdout: "", stderr: "", exitCode: 1 });

    const result = await exec("search_code", {
      directory: "repo",
      pattern: "nonexistent",
      file_glob: "",
      context_lines: "0",
    });

    expect(result.found).toBe(0);
  });

  it("includes file glob in command", async () => {
    mockShellExec.mockResolvedValue({ stdout: "", stderr: "", exitCode: 1 });

    await exec("search_code", {
      directory: ".",
      pattern: "TODO",
      file_glob: "*.ts",
      context_lines: "2",
    });

    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("--glob '*.ts'");
    expect(cmd).toContain("-C 2");
  });
});

describe("run_linter", () => {
  it("runs ruff for python", async () => {
    mockShellExec.mockResolvedValue({ stdout: "[]", stderr: "", exitCode: 0 });

    await exec("run_linter", {
      directory: "repo",
      language: "python",
      fix: "false",
    });

    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("ruff check");
    expect(cmd).not.toContain("--fix");
  });

  it("passes --fix when requested", async () => {
    mockShellExec.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await exec("run_linter", {
      directory: "repo",
      language: "python",
      fix: "true",
    });

    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("--fix");
  });

  it("uses eslint for javascript", async () => {
    mockShellExec.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await exec("run_linter", {
      directory: "repo",
      language: "javascript",
      fix: "false",
    });

    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("eslint");
  });
});

describe("file_diff", () => {
  it("compares two files", async () => {
    mockShellExec.mockResolvedValue({
      stdout: "--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n",
      stderr: "",
      exitCode: 1,
    });

    const result = await exec("file_diff", { file_a: "old.py", file_b: "new.py" });

    expect(result.diff).toContain("-old");
    expect(result.diff).toContain("+new");
    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("diff -u 'old.py' 'new.py'");
  });
});

// ── Testing Tools ──────────────────────────────────────────────────────

describe("run_tests", () => {
  it("detects python and runs pytest", async () => {
    mockShellExec
      .mockResolvedValueOnce({ stdout: "python\n", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "1 passed\n", stderr: "", exitCode: 0 });

    const result = await exec("run_tests", {
      directory: "repo",
      filter: "",
      verbose: "true",
    });

    expect(result.exit_code).toBe(0);
    const testCmd = mockShellExec.mock.calls[1][1] as string;
    expect(testCmd).toContain("pytest");
    expect(testCmd).toContain("-v");
  });

  it("detects node and runs vitest", async () => {
    mockShellExec
      .mockResolvedValueOnce({ stdout: "node\n", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '{"name":"test","devDependencies":{"vitest":"^3.0.0"}}', stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "Tests: 5 passed\n", stderr: "", exitCode: 0 });

    const result = await exec("run_tests", {
      directory: "repo",
      filter: "",
      verbose: "false",
    });

    expect(result.exit_code).toBe(0);
    const testCmd = mockShellExec.mock.calls[2][1] as string;
    expect(testCmd).toContain("vitest run");
  });

  it("detects node and falls back to jest", async () => {
    mockShellExec
      .mockResolvedValueOnce({ stdout: "node\n", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '{"name":"test","devDependencies":{"jest":"^29"}}', stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "Tests: 5 passed\n", stderr: "", exitCode: 0 });

    await exec("run_tests", { directory: "repo", filter: "", verbose: "false" });

    const testCmd = mockShellExec.mock.calls[2][1] as string;
    expect(testCmd).toContain("npx jest");
  });

  it("returns error for unknown project type", async () => {
    mockShellExec.mockResolvedValueOnce({ stdout: "unknown\n", stderr: "", exitCode: 0 });

    const result = await exec("run_tests", { directory: "empty", filter: "", verbose: "false" });

    expect(result.exit_code).toBe(-1);
    expect(result.stderr).toContain("Could not detect");
  });

  it("applies test filter for python", async () => {
    mockShellExec
      .mockResolvedValueOnce({ stdout: "python\n", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });

    await exec("run_tests", { directory: "repo", filter: "test_auth", verbose: "false" });

    const testCmd = mockShellExec.mock.calls[1][1] as string;
    expect(testCmd).toContain("-k 'test_auth'");
  });
});

describe("run_single_test", () => {
  it("runs a specific python test", async () => {
    mockShellExec.mockResolvedValue({ stdout: "PASSED", stderr: "", exitCode: 0 });

    const result = await exec("run_single_test", {
      test_path: "tests/test_auth.py",
      test_name: "test_login",
    });

    expect(result.exit_code).toBe(0);
    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("pytest");
    expect(cmd).toContain("-k 'test_login'");
  });

  it("runs a specific JS test", async () => {
    mockShellExec.mockResolvedValue({ stdout: "PASS", stderr: "", exitCode: 0 });

    const result = await exec("run_single_test", {
      test_path: "src/__tests__/auth.test.ts",
      test_name: "",
    });

    expect(result.exit_code).toBe(0);
    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("vitest run");
  });
});

describe("test_coverage", () => {
  it("runs coverage for python project", async () => {
    mockShellExec
      .mockResolvedValueOnce({ stdout: "python\n", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "TOTAL   90%\n", stderr: "", exitCode: 0 });

    const result = await exec("test_coverage", {
      directory: "repo",
      source_dir: "src",
    });

    expect(result.exit_code).toBe(0);
    const cmd = mockShellExec.mock.calls[1][1] as string;
    expect(cmd).toContain("--cov='src'");
    expect(cmd).toContain("--cov-report=term-missing");
  });

  it("runs coverage for node project", async () => {
    mockShellExec
      .mockResolvedValueOnce({ stdout: "node\n", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "Coverage: 85%\n", stderr: "", exitCode: 0 });

    await exec("test_coverage", { directory: "repo", source_dir: "." });

    const cmd = mockShellExec.mock.calls[1][1] as string;
    expect(cmd).toContain("--coverage");
  });
});

// ── Project-Aware Tools ────────────────────────────────────────────────

describe("project_structure", () => {
  it("runs tree, stats, and config in parallel", async () => {
    mockShellExec
      .mockResolvedValueOnce({ stdout: ".\n├── src/\n└── package.json\n", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "10 ts\n5 json\n", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '{"name":"project"}', stderr: "", exitCode: 0 });

    const result = await exec("project_structure", { directory: "repo", depth: "3" });

    expect(result.tree).toContain("src/");
    expect(result.file_types).toContain("ts");
    expect(result.project_config).toContain("project");
  });

  it("defaults depth to 3 for invalid input", async () => {
    mockShellExec.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await exec("project_structure", { directory: ".", depth: "bad" });

    const cmd = mockShellExec.mock.calls[0][1] as string;
    expect(cmd).toContain("-L 3");
  });
});

describe("install_dependencies", () => {
  it("detects npm and runs npm install", async () => {
    mockShellExec
      .mockResolvedValueOnce({ stdout: "npm\n", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "added 100 packages\n", stderr: "", exitCode: 0 });

    const result = await exec("install_dependencies", { directory: "repo", extra: "" });

    expect(result.manager).toBe("npm");
    expect(result.exit_code).toBe(0);
    const cmd = mockShellExec.mock.calls[1][1] as string;
    expect(cmd).toContain("npm install");
  });

  it("detects pnpm", async () => {
    mockShellExec
      .mockResolvedValueOnce({ stdout: "pnpm\n", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });

    const result = await exec("install_dependencies", { directory: "repo", extra: "" });

    expect(result.manager).toBe("pnpm");
    const cmd = mockShellExec.mock.calls[1][1] as string;
    expect(cmd).toContain("pnpm install");
  });

  it("detects pip requirements.txt", async () => {
    mockShellExec
      .mockResolvedValueOnce({ stdout: "pip-req\n", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });

    const result = await exec("install_dependencies", { directory: "repo", extra: "" });

    expect(result.manager).toBe("pip-req");
    const cmd = mockShellExec.mock.calls[1][1] as string;
    expect(cmd).toContain("pip install -r requirements.txt");
  });

  it("returns error for unknown manager", async () => {
    mockShellExec.mockResolvedValueOnce({ stdout: "unknown\n", stderr: "", exitCode: 0 });

    const result = await exec("install_dependencies", { directory: "empty", extra: "" });

    expect(result.exit_code).toBe(-1);
    expect(result.stderr).toContain("No recognized package manager");
  });

  it("passes extra args to package manager", async () => {
    mockShellExec
      .mockResolvedValueOnce({ stdout: "npm\n", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });

    await exec("install_dependencies", { directory: "repo", extra: "--legacy-peer-deps" });

    const cmd = mockShellExec.mock.calls[1][1] as string;
    expect(cmd).toContain("--legacy-peer-deps");
  });
});

// ── Browser Automation Tools ───────────────────────────────────────────

describe("browser_navigate", () => {
  it("navigates to a URL and returns info", async () => {
    mockNavigateTo.mockResolvedValue({ url: "https://example.com", title: "Example", status: 200 });

    const result = await exec("browser_navigate", { url: "https://example.com" });

    expect(result.status).toBe("navigated");
    expect(result.url).toBe("https://example.com");
    expect(result.title).toBe("Example");
    expect(result.http_status).toBe(200);
    expect(mockNavigateTo).toHaveBeenCalledWith(SESSION_ID, "https://example.com");
  });

  it("returns error for blocked URL", async () => {
    mockNavigateTo.mockRejectedValue(new Error("URL blocked: private IP"));

    const result = await exec("browser_navigate", { url: "http://192.168.1.1" });

    expect(result.status).toBe("error");
    expect(result.message).toContain("blocked");
  });
});

describe("browser_snapshot", () => {
  it("returns page accessibility snapshot", async () => {
    mockGetPageSnapshot.mockResolvedValue({
      url: "https://example.com",
      title: "Example",
      snapshot: "heading: Example\nlink: About\n",
    });

    const result = await exec("browser_snapshot", {});

    expect(result.url).toBe("https://example.com");
    expect(result.snapshot).toContain("heading: Example");
  });

  it("returns empty on error", async () => {
    mockGetPageSnapshot.mockRejectedValue(new Error("No page open"));

    const result = await exec("browser_snapshot", {});

    expect(result.error).toBe("No page open");
    expect(result.snapshot).toBe("");
  });
});

describe("browser_screenshot", () => {
  it("returns base64 screenshot", async () => {
    mockScreenshotPage.mockResolvedValue("iVBORw0KGgoAAAANS...");

    const result = await exec("browser_screenshot", {});

    expect(result.status).toBe("ok");
    expect(result.format).toBe("png");
    expect(result.base64).toBe("iVBORw0KGgoAAAANS...");
    expect(result.size_bytes).toBeGreaterThan(0);
  });

  it("returns error when no page open", async () => {
    mockScreenshotPage.mockRejectedValue(new Error("No page"));

    const result = await exec("browser_screenshot", {});

    expect(result.status).toBe("error");
  });
});

describe("browser_click", () => {
  it("clicks an element by selector", async () => {
    mockClickElement.mockResolvedValue(undefined);

    const result = await exec("browser_click", { selector: "#login-btn" });

    expect(result.status).toBe("clicked");
    expect(result.selector).toBe("#login-btn");
    expect(mockClickElement).toHaveBeenCalledWith(SESSION_ID, "#login-btn");
  });

  it("returns error for missing element", async () => {
    mockClickElement.mockRejectedValue(new Error("Element not found"));

    const result = await exec("browser_click", { selector: "#nonexistent" });

    expect(result.status).toBe("error");
    expect(result.selector).toBe("#nonexistent");
  });
});

describe("browser_type", () => {
  it("types text into an input field", async () => {
    mockTypeText.mockResolvedValue(undefined);

    const result = await exec("browser_type", {
      selector: "#email",
      text: "user@example.com",
    });

    expect(result.status).toBe("typed");
    expect(result.length).toBe(16);
    expect(mockTypeText).toHaveBeenCalledWith(SESSION_ID, "#email", "user@example.com");
  });

  it("returns error for missing field", async () => {
    mockTypeText.mockRejectedValue(new Error("Input not found"));

    const result = await exec("browser_type", { selector: "#missing", text: "test" });

    expect(result.status).toBe("error");
  });
});

describe("browser_evaluate", () => {
  it("evaluates JavaScript in page context", async () => {
    mockEvaluateScript.mockResolvedValue("Example Domain");

    const result = await exec("browser_evaluate", { script: "document.title" });

    expect(result.status).toBe("ok");
    expect(result.result).toBe("Example Domain");
  });

  it("returns error for script failure", async () => {
    mockEvaluateScript.mockRejectedValue(new Error("ReferenceError: x is not defined"));

    const result = await exec("browser_evaluate", { script: "x.y.z" });

    expect(result.status).toBe("error");
  });
});

describe("browser_close", () => {
  it("closes the browser page", async () => {
    mockClosePage.mockResolvedValue(undefined);

    const result = await exec("browser_close", {});

    expect(result.status).toBe("closed");
    expect(mockClosePage).toHaveBeenCalledWith(SESSION_ID);
  });

  it("returns error when close fails", async () => {
    mockClosePage.mockRejectedValue(new Error("Already closed"));

    const result = await exec("browser_close", {});

    expect(result.status).toBe("error");
  });
});

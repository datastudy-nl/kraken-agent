import { and, desc, eq, lte, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { buildSystemPrompt } from "./context.js";
import { runChat } from "./llm.js";
import {
  createSession,
  getSession,
  storeMessage,
} from "./memory.js";
import { getBuiltinTools } from "./builtinTools.js";
import { queuePostConversation } from "./queue.js";
import { config } from "../config.js";
import cron from "node-cron";

// ===== CRUD =====

export async function createSchedule(input: {
  name: string;
  description?: string;
  cronExpression: string;
  taskPrompt: string;
  originSessionId?: string;
  maxRuns?: number;
  metadata?: Record<string, unknown>;
}) {
  if (!cron.validate(input.cronExpression)) {
    throw new Error(`Invalid cron expression: ${input.cronExpression}`);
  }

  const nextRunAt = getNextCronDate(input.cronExpression);

  const [row] = await db
    .insert(schema.schedules)
    .values({
      name: input.name,
      description: input.description ?? "",
      cronExpression: input.cronExpression,
      taskPrompt: input.taskPrompt,
      originSessionId: input.originSessionId,
      maxRuns: input.maxRuns,
      nextRunAt,
      metadata: input.metadata ?? {},
    })
    .returning();

  return formatSchedule(row);
}

export async function createOneTimeSchedule(input: {
  name: string;
  description?: string;
  runAt: Date;
  taskPrompt: string;
  originSessionId?: string;
  metadata?: Record<string, unknown>;
}) {
  if (input.runAt.getTime() <= Date.now()) {
    throw new Error("run_at must be in the future");
  }

  const [row] = await db
    .insert(schema.schedules)
    .values({
      name: input.name,
      description: input.description ?? "",
      cronExpression: "__once__",
      taskPrompt: input.taskPrompt,
      originSessionId: input.originSessionId,
      maxRuns: 1,
      nextRunAt: input.runAt,
      metadata: input.metadata ?? {},
    })
    .returning();

  return formatSchedule(row);
}

export async function getSchedule(id: string) {
  const row = await db.query.schedules.findFirst({
    where: eq(schema.schedules.id, id),
  });
  if (!row) return null;
  return formatSchedule(row);
}

export async function listSchedules(limit: number, offset: number) {
  const rows = await db
    .select()
    .from(schema.schedules)
    .orderBy(desc(schema.schedules.createdAt))
    .limit(limit)
    .offset(offset);

  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.schedules);

  return {
    schedules: rows.map(formatSchedule),
    total: Number(total[0]?.count ?? 0),
    limit,
    offset,
  };
}

export async function updateSchedule(
  id: string,
  input: {
    name?: string;
    description?: string;
    cronExpression?: string;
    taskPrompt?: string;
    enabled?: boolean;
    maxRuns?: number | null;
  },
) {
  const existing = await db.query.schedules.findFirst({
    where: eq(schema.schedules.id, id),
  });
  if (!existing) return null;

  const cronExpr = input.cronExpression ?? existing.cronExpression;
  if (input.cronExpression && !cron.validate(input.cronExpression)) {
    throw new Error(`Invalid cron expression: ${input.cronExpression}`);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.taskPrompt !== undefined) updates.taskPrompt = input.taskPrompt;
  if (input.enabled !== undefined) updates.enabled = input.enabled;
  if (input.maxRuns !== undefined) updates.maxRuns = input.maxRuns;
  if (input.cronExpression !== undefined) {
    updates.cronExpression = input.cronExpression;
    updates.nextRunAt = getNextCronDate(input.cronExpression);
  }

  const [row] = await db
    .update(schema.schedules)
    .set(updates)
    .where(eq(schema.schedules.id, id))
    .returning();

  return formatSchedule(row);
}

export async function deleteSchedule(id: string): Promise<boolean> {
  const rows = await db
    .delete(schema.schedules)
    .where(eq(schema.schedules.id, id))
    .returning();
  return rows.length > 0;
}

// ===== Execution =====

/**
 * Find all schedules that are due (nextRunAt <= now, enabled).
 */
export async function getDueSchedules() {
  const now = new Date();
  const rows = await db
    .select()
    .from(schema.schedules)
    .where(
      and(
        eq(schema.schedules.enabled, true),
        lte(schema.schedules.nextRunAt, now),
      ),
    )
    .orderBy(schema.schedules.nextRunAt);

  return rows.map(formatSchedule);
}

/**
 * Execute a single schedule run:
 * 1. Create a dedicated session for the run
 * 2. Run the task prompt through the LLM with tools
 * 3. If the origin session has no pending message, post the result there
 * 4. Update schedule metadata (lastRunAt, nextRunAt, runCount)
 */
export async function executeSchedule(scheduleId: string): Promise<{
  scheduleId: string;
  runSessionId: string;
  result: string;
  sentToOrigin: boolean;
}> {
  const schedule = await getSchedule(scheduleId);
  if (!schedule) throw new Error(`Schedule ${scheduleId} not found`);

  // Create a dedicated session for this run
  const runSession = await createSession({
    name: `Schedule: ${schedule.name} — ${new Date().toISOString()}`,
    sessionKey: `schedule-run-${schedule.id}-${Date.now()}`,
    metadata: {
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      type: "schedule_run",
    },
  });

  // Build system prompt with schedule context
  const taskMessage = `[SCHEDULED TASK] ${schedule.task_prompt}\n\nThis is an automated scheduled task named "${schedule.name}". Execute the task and provide the result.`;

  const system = await buildSystemPrompt({
    message: taskMessage,
    sessionHistory: [],
  });

  // Store the task prompt as a "user" message in the run session
  await storeMessage({
    sessionId: runSession.id,
    role: "user",
    content: taskMessage,
  });

  // Run the LLM
  const tools = getBuiltinTools(runSession.id);
  const result = await runChat({
    system,
    messages: [{ role: "user" as const, content: taskMessage }],
    model: config.KRAKEN_DEFAULT_MODEL,
    tools,
  });

  // Store the result
  await storeMessage({
    sessionId: runSession.id,
    role: "assistant",
    content: result.text,
    model: config.KRAKEN_DEFAULT_MODEL,
    tokenCount:
      (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
  });

  await queuePostConversation(runSession.id, [
    { role: "user", content: taskMessage },
    { role: "assistant", content: result.text },
  ]);

  // Try to send the result to the origin session if no message is pending
  let sentToOrigin = false;
  if (schedule.origin_session_id) {
    const originIdle = await isSessionIdle(schedule.origin_session_id);
    if (originIdle) {
      await storeMessage({
        sessionId: schedule.origin_session_id,
        role: "assistant",
        content: `📋 **Scheduled task "${schedule.name}" completed:**\n\n${result.text}`,
        metadata: {
          scheduleId: schedule.id,
          runSessionId: runSession.id,
          type: "schedule_result",
        },
      });
      sentToOrigin = true;
    }
  }

  // Update the schedule
  const newRunCount = schedule.run_count + 1;
  const reachedMax =
    schedule.max_runs !== null && newRunCount >= schedule.max_runs;

  const isOneShot = schedule.cron_expression === "__once__";

  await db
    .update(schema.schedules)
    .set({
      lastRunAt: new Date(),
      nextRunAt: reachedMax || isOneShot
        ? null
        : getNextCronDate(schedule.cron_expression),
      runCount: newRunCount,
      enabled: reachedMax || isOneShot ? false : true,
      updatedAt: new Date(),
    })
    .where(eq(schema.schedules.id, scheduleId));

  return {
    scheduleId: schedule.id,
    runSessionId: runSession.id,
    result: result.text,
    sentToOrigin,
  };
}

// ===== Helpers =====

/**
 * Check if a session is idle (no assistant message in the last 5 seconds,
 * indicating no in-flight request).
 */
async function isSessionIdle(sessionId: string): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session || !session.messages?.length) return true;

  const lastMessage = session.messages[session.messages.length - 1];
  // If the last message is from the user and was sent < 30s ago, a response is likely pending
  if (lastMessage.role === "user") {
    const msgTime = new Date(lastMessage.timestamp).getTime();
    const now = Date.now();
    if (now - msgTime < 30_000) return false;
  }

  return true;
}

/**
 * Compute the next run date from a cron expression.
 */
function getNextCronDate(cronExpression: string): Date {
  const now = new Date();

  // Scan forward minute by minute up to 24h
  const candidate = new Date(now.getTime() + 60_000);
  candidate.setSeconds(0, 0);

  for (let i = 0; i < 1440; i++) {
    const test = new Date(candidate.getTime() + i * 60_000);
    if (matchesCron(cronExpression, test)) {
      return test;
    }
  }

  // Fallback: 1 hour from now
  return new Date(now.getTime() + 3_600_000);
}

function matchesCron(expr: string, date: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return false;

  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1;
  const dayOfWeek = date.getDay();

  return (
    matchField(parts[0], minute, 0, 59) &&
    matchField(parts[1], hour, 0, 23) &&
    matchField(parts[2], dayOfMonth, 1, 31) &&
    matchField(parts[3], month, 1, 12) &&
    matchField(parts[4], dayOfWeek, 0, 7)
  );
}

function matchField(
  field: string,
  value: number,
  min: number,
  max: number,
): boolean {
  if (field === "*") return true;

  // Handle */n (step)
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    if (isNaN(step) || step <= 0) return false;
    return value % step === 0;
  }

  // Handle comma-separated values
  const values = field.split(",");
  for (const v of values) {
    if (v.includes("-")) {
      const [startStr, endStr] = v.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (value >= start && value <= end) return true;
    } else {
      if (parseInt(v, 10) === value) return true;
    }
  }

  return false;
}

function parseCronToMs(cronExpression: string): number {
  // Rough estimate for simple intervals
  const parts = cronExpression.trim().split(/\s+/);
  if (parts[0].startsWith("*/")) {
    return parseInt(parts[0].slice(2), 10) * 60_000;
  }
  return 3_600_000; // default 1h
}

function formatSchedule(row: typeof schema.schedules.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cron_expression: row.cronExpression,
    task_prompt: row.taskPrompt,
    origin_session_id: row.originSessionId,
    enabled: row.enabled,
    last_run_at: row.lastRunAt?.toISOString() ?? null,
    next_run_at: row.nextRunAt?.toISOString() ?? null,
    run_count: row.runCount,
    max_runs: row.maxRuns,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    metadata: row.metadata,
  };
}

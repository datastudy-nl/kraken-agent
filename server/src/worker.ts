/**
 * Background worker process for async tasks:
 * - GraphRAG entity extraction after conversations
 * - Incremental community detection (Leiden)
 * - Community re-summarization
 * - User model updates
 * - Skill auto-creation from reflection
 */
import { Worker } from "bullmq";
import IORedis from "ioredis";
import cron from "node-cron";
import { config } from "./config.js";
import { getSession, ingestConversationToGraph, runDreamCycle, archiveExpiredSessions } from "./services/memory.js";
import { communityQueue, dreamQueue, scheduleQueue } from "./services/queue.js";
import { compressUserModel, summarizeCommunity } from "./services/llm.js";
import { getUserModel, setUserModel } from "./services/identity.js";
import { upsertCommunity } from "./services/graph.js";
import { getDueSchedules, executeSchedule } from "./services/schedules.js";
import { reflectAndImprove, shouldReflect } from "./services/reflection.js";
import { closePage } from "./services/browser.js";

const connection = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// --- Entity Extraction Worker ---
const extractionWorker = new Worker(
  "memory-extraction",
  async (job) => {
    const { sessionId, messages } = job.data;
    console.log(`[extraction] Processing session ${sessionId}, ${messages.length} messages`);

    const result = await ingestConversationToGraph({ sessionId, messages });
    if (result.affectedEntityIds.length > 0) {
      await communityQueue.add("recluster", {
        affectedEntityIds: result.affectedEntityIds,
      });
    }

    return result;
  },
  { connection },
);

// --- Community Update Worker ---
const communityWorker = new Worker(
  "memory-communities",
  async (job) => {
    const { affectedEntityIds } = job.data;
    console.log(`[communities] Re-clustering around ${affectedEntityIds.length} entities`);

    if (!affectedEntityIds.length) return;

    const summary = await summarizeCommunity(
      "Affected Memory Cluster",
      affectedEntityIds,
    );

    await upsertCommunity({
      id: crypto.randomUUID(),
      name: "Affected Memory Cluster",
      summary,
      level: 0,
      entityIds: affectedEntityIds,
    });
  },
  { connection },
);

// --- User Model Worker ---
const userModelWorker = new Worker(
  "memory-user-model",
  async (job) => {
    const { sessionId } = job.data;
    console.log(`[user-model] Updating user model from session ${sessionId}`);

    const session = await getSession(sessionId);
    if (!session) return;

    const current = await getUserModel();
    const signals = session.messages
      .filter((message) => message.role === "user")
      .map((message) => message.content)
      .slice(-10);

    const content = await compressUserModel(current.content, signals);
    await setUserModel(content);
  },
  { connection },
);

const dreamWorker = new Worker(
  "memory-dream",
  async () => {
    const result = await runDreamCycle();
    console.log(
      `[dreaming] Inferred ${result.entities.length} entities and ${result.relationships.length} relationships`,
    );
    return result;
  },
  { connection },
);

// --- Schedule Execution Worker ---
const scheduleWorker = new Worker(
  "schedule-execution",
  async (job) => {
    const { scheduleId } = job.data;
    console.log(`[schedule] Executing schedule ${scheduleId}`);

    const result = await executeSchedule(scheduleId);
    console.log(
      `[schedule] Completed "${scheduleId}" → session ${result.runSessionId}, sent to origin: ${result.sentToOrigin}`,
    );
    return result;
  },
  { connection },
);

// --- Skill Reflection Worker ---
const reflectionWorker = new Worker(
  "skill-reflection",
  async (job) => {
    const { sessionId, messages, toolCallCount, hasErrors } = job.data;
    console.log(
      `[reflection] Reflecting on session ${sessionId} (${toolCallCount} tool calls, errors: ${hasErrors})`,
    );

    if (!shouldReflect(messages, toolCallCount, hasErrors)) {
      console.log("[reflection] Skipped — conditions not met");
      return;
    }

    const result = await reflectAndImprove({
      sessionId,
      messages,
      toolCallCount,
      hasErrors,
    });
    console.log(`[reflection] ${result ? "Created/updated skill" : "No skill changes"}`);
    return result;
  },
  { connection },
);

// --- Schedule Tick (every minute, find due schedules and queue them) ---
cron.schedule("* * * * *", async () => {
  try {
    const due = await getDueSchedules();
    for (const schedule of due) {
      await scheduleQueue.add(
        "execute",
        { scheduleId: schedule.id },
        { jobId: `schedule-${schedule.id}-${Date.now()}` },
      );
    }
    if (due.length > 0) {
      console.log(`[schedule-tick] Queued ${due.length} due schedule(s)`);
    }
  } catch (err) {
    console.error("[schedule-tick] Error checking due schedules:", err);
  }
});

// --- Session Cleanup (every 30 minutes, archive stale sessions) ---
cron.schedule("*/30 * * * *", async () => {
  try {
    const archived = await archiveExpiredSessions(
      config.KRAKEN_SESSION_MAX_AGE_HOURS,
      config.KRAKEN_SESSION_IDLE_MINUTES,
    );
    if (archived > 0) {
      console.log(`[session-cleanup] Archived ${archived} expired session(s)`);
    }
  } catch (err) {
    console.error("[session-cleanup] Error:", err);
  }
});

cron.schedule(config.KRAKEN_DREAM_CRON, async () => {
  await dreamQueue.add("dream", { scheduledAt: new Date().toISOString() });
});

console.log("🐙 Kraken worker started — listening for background jobs");

// Graceful shutdown
process.on("SIGTERM", async () => {
  await extractionWorker.close();
  await communityWorker.close();
  await userModelWorker.close();
  await dreamWorker.close();
  await scheduleWorker.close();
  await reflectionWorker.close();
  process.exit(0);
});

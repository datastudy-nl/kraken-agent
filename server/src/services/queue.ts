import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config.js";

export const redis = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// --- Job Queues ---

export const extractionQueue = new Queue("memory-extraction", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export const communityQueue = new Queue("memory-communities", {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 50,
    removeOnFail: 200,
  },
});

export const userModelQueue = new Queue("memory-user-model", {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 50,
    removeOnFail: 200,
  },
});

export const dreamQueue = new Queue("memory-dream", {
  connection: redis,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 20,
    removeOnFail: 100,
  },
});

export const scheduleQueue = new Queue("schedule-execution", {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export const reflectionQueue = new Queue("skill-reflection", {
  connection: redis,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

// --- Helper to queue post-conversation jobs ---

export async function queuePostConversation(
  sessionId: string,
  newMessages: Array<{ role: string; content: string }>,
  toolCallCount: number = 0,
  hasErrors: boolean = false,
): Promise<void> {
  await extractionQueue.add("extract", { sessionId, messages: newMessages });
  await userModelQueue.add("update", { sessionId });

  // Queue skill reflection if the conversation had significant tool usage or errors
  if (toolCallCount >= 3 || hasErrors) {
    await reflectionQueue.add("reflect", {
      sessionId,
      messages: newMessages,
      toolCallCount,
      hasErrors,
    });
  }
}

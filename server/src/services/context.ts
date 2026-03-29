import { config } from "../config.js";
import { getSoul, getUserModel, getAgentsMd } from "./identity.js";
import { queryMemory } from "./memory.js";
import { getRelevantSkills } from "./skills.js";
import { getPersonalityOverlay } from "./personality.js";

export interface ContextInput {
  message: string;
  sessionHistory: Array<{ role: string; content: string }>;
  personality?: string | null;
}

/** Rough token estimation: ~4 chars per token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Truncate text to fit within a token budget. */
function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[...truncated to fit context budget]";
}

// --- Context budget allocation (in tokens) ---
const BUDGET = {
  soul: () => Math.ceil(config.KRAKEN_MAX_SOUL_CHARS / 4),
  agentsMd: () => 500,
  userModel: () => Math.ceil(config.KRAKEN_MAX_USER_MODEL_CHARS / 4),
  memory: () => 4000,
  skills: () => 1500,
  personality: () => 200,
  // Conversation history gets the remaining budget
};

export async function buildSystemPrompt(input: ContextInput): Promise<string> {
  const [soul, userModel, agentsMd, skills] = await Promise.all([
    getSoul(),
    getUserModel(),
    getAgentsMd(),
    getRelevantSkills(input.message, config.KRAKEN_MAX_SKILLS_PER_QUERY),
  ]);

  // Query memory with user model context so retrieval can find entities
  // mentioned in the user model even when the current message doesn't
  // textually overlap (e.g. "what do I like?" → finds "TypeScript" from model)
  const memory = await queryMemory({
    query: input.message,
    mode: "auto",
    limit: 8,
    userModel: userModel.content,
  });

  const sections: string[] = [];

  // 1. SOUL.md (highest priority — always included)
  sections.push(truncateToTokens(soul.content, BUDGET.soul()));

  // 1b. Current time (needed for scheduling, time-aware responses)
  sections.push(`# CURRENT TIME\n\n${new Date().toISOString()}`);

  // 2. Personality overlay (session-level, if active)
  if (input.personality) {
    const overlay = getPersonalityOverlay(input.personality);
    if (overlay) {
      sections.push(truncateToTokens(overlay, BUDGET.personality()));
    }
  }

  // 3. AGENTS.md (project context)
  if (agentsMd.content) {
    sections.push(
      truncateToTokens(`# PROJECT CONTEXT\n\n${agentsMd.content}`, BUDGET.agentsMd()),
    );
  }

  // 4. User Model
  if (userModel.content) {
    sections.push(
      truncateToTokens(`# USER MODEL\n\n${userModel.content}`, BUDGET.userModel()),
    );
  }

  // 5. Memory context (GraphRAG entities, communities, episodes)
  const memorySection = formatMemory(memory);
  if (memorySection) {
    sections.push(
      truncateToTokens(`# MEMORY CONTEXT\n\n${memorySection}`, BUDGET.memory()),
    );
  }

  // 6. Relevant skills (progressive disclosure)
  if (skills.length > 0) {
    const skillsSection = skills.join("\n\n---\n\n");
    sections.push(
      truncateToTokens(`# RELEVANT SKILLS\n\n${skillsSection}`, BUDGET.skills()),
    );
  }

  return sections.filter(Boolean).join("\n\n---\n\n");
}

function formatMemory(memory: Awaited<ReturnType<typeof queryMemory>>): string {
  const lines: string[] = [];

  // Explicit memories get top billing — these are facts the user explicitly asked to remember
  if (memory.explicitMemories && memory.explicitMemories.length > 0) {
    lines.push("## Stored Memories (explicitly remembered facts)");
    for (const mem of memory.explicitMemories) {
      lines.push(`- ${mem.content} (stored: ${mem.timestamp})`);
    }
  }

  if (memory.entities.length > 0) {
    lines.push("\n## Entities");
    for (const entity of memory.entities) {
      lines.push(`- ${entity.type}: ${entity.name}`);
    }
  }

  if (memory.communities.length > 0) {
    lines.push("\n## Community Summaries");
    for (const community of memory.communities) {
      lines.push(`- ${community.summary}`);
    }
  }

  if (memory.results.length > 0) {
    lines.push("\n## Retrieved Context");
    for (const result of memory.results.slice(0, 5)) {
      if (typeof result === "object") {
        lines.push(`- ${JSON.stringify(result)}`);
      }
    }
  }

  return lines.join("\n");
}

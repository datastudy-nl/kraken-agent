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

/** Truncate text to fit within a token budget. */
function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[...truncated to fit context budget]";
}

const BUDGET = {
  soul: () => Math.ceil(config.KRAKEN_MAX_SOUL_CHARS / 4),
  agentsMd: () => 500,
  userModel: () => Math.ceil(config.KRAKEN_MAX_USER_MODEL_CHARS / 4),
  memory: () => 4000,
  skills: () => 1500,
  personality: () => 200,
};

export async function buildSystemPrompt(input: ContextInput): Promise<string> {
  const [soul, userModel, agentsMd, skills] = await Promise.all([
    getSoul(),
    getUserModel(),
    getAgentsMd(),
    getRelevantSkills(input.message, config.KRAKEN_MAX_SKILLS_PER_QUERY),
  ]);

  const memory = await queryMemory({
    query: input.message,
    mode: "auto",
    limit: 8,
    userModel: userModel.content,
  });

  const sections: string[] = [];
  sections.push(truncateToTokens(soul.content, BUDGET.soul()));
  sections.push(`# CURRENT TIME\n\n${new Date().toISOString()}`);

  if (input.personality) {
    const overlay = getPersonalityOverlay(input.personality);
    if (overlay) {
      sections.push(truncateToTokens(overlay, BUDGET.personality()));
    }
  }

  if (agentsMd.content) {
    sections.push(truncateToTokens(`# PROJECT CONTEXT\n\n${agentsMd.content}`, BUDGET.agentsMd()));
  }

  if (userModel.content) {
    sections.push(truncateToTokens(`# USER MODEL\n\n${userModel.content}`, BUDGET.userModel()));
  }

  const memorySection = formatMemory(memory);
  if (memorySection) {
    sections.push(truncateToTokens(`# MEMORY CONTEXT\n\n${memorySection}`, BUDGET.memory()));
  }

  if (skills.length > 0) {
    const skillsSection = skills.join("\n\n---\n\n");
    sections.push(truncateToTokens(`# RELEVANT SKILLS\n\n${skillsSection}`, BUDGET.skills()));
  }

  return sections.filter(Boolean).join("\n\n---\n\n");
}

function formatMemory(memory: Awaited<ReturnType<typeof queryMemory>>): string {
  const lines: string[] = [];

  if (memory.explicitMemories && memory.explicitMemories.length > 0) {
    lines.push("## Confirmed Facts");
    for (const mem of memory.explicitMemories) {
      const labels = [mem.kind, ...(mem.tags ?? [])].filter(Boolean).join(", ");
      lines.push(`- ${mem.content} (${labels}; evidence: ${mem.evidenceCount}; stored: ${mem.timestamp})`);
    }
  }

  if (memory.workingMemory && memory.workingMemory.length > 0) {
    lines.push("\n## Current Working / Project State");
    for (const mem of memory.workingMemory.slice(0, 5)) {
      const labels = [mem.kind, ...(mem.tags ?? [])].filter(Boolean).join(", ");
      lines.push(`- ${mem.content} (${labels}; evidence: ${mem.evidenceCount})`);
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

  if (memory.inferredMemories && memory.inferredMemories.length > 0) {
    lines.push("\n## Hypotheses / Lower-Confidence Memory");
    for (const mem of memory.inferredMemories.slice(0, 5)) {
      lines.push(`- ${mem.content} (${mem.kind}; ${mem.sourceType}; status: ${mem.status}; evidence: ${mem.evidenceCount})`);
    }
  }

  if (memory.evidenceEpisodes && memory.evidenceEpisodes.length > 0) {
    lines.push("\n## Supporting Episode Evidence");
    for (const episode of memory.evidenceEpisodes.slice(0, 5)) {
      lines.push(`- [${episode.role}] ${episode.content} (${episode.timestamp})`);
    }
  }

  return lines.join("\n");
}

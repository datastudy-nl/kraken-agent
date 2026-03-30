import { generateObject, generateText, embed, type CoreTool, type LanguageModelV1 } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { config } from "../config.js";
import { extractedMemoryTripleSchema, type MemoryKind } from "./memory_schema.js";

/** Map Kraken-branded names → upstream provider model IDs */
const MODEL_ALIASES: Record<string, string> = {
  "kraken-omni-2.7": "gpt-5.4",
  "kraken-omni-2.7m": "gpt-5.4-mini",
  "kraken-omni-2.7n": "gpt-5.4-nano",
};

export function resolveModel(modelName: string): LanguageModelV1 {
  const resolved = MODEL_ALIASES[modelName] ?? modelName;
  if (resolved.startsWith("claude")) {
    return anthropic(resolved);
  }
  return openai(resolved);
}

export const defaultModel = resolveModel(config.KRAKEN_DEFAULT_MODEL);
export const extractionModel = resolveModel(config.KRAKEN_EXTRACTION_MODEL);
export const embeddingModel = openai.embedding("text-embedding-3-small");

export interface GenerateArgs {
  system: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  model?: string;
  tools?: Record<string, CoreTool>;
  maxSteps?: number;
}

export async function runChat(args: GenerateArgs): Promise<{
  text: string;
  toolCalls?: Array<{ toolName: string; args: unknown; result: unknown }>;
  usage?: { inputTokens?: number; outputTokens?: number };
}> {
  try {
    const result = await generateText({
      model: args.model ? resolveModel(args.model) : defaultModel,
      system: args.system,
      messages: args.messages,
      tools: args.tools,
      maxSteps: args.tools ? (args.maxSteps ?? 25) : undefined,
    });

    return {
      text: result.text,
      toolCalls: result.steps
        ?.flatMap((step) =>
          step.toolCalls?.map((tc) => ({
            toolName: tc.toolName,
            args: tc.args,
            result: undefined,
          })) ?? [],
        ),
      usage: {
        inputTokens: result.usage?.promptTokens,
        outputTokens: result.usage?.completionTokens,
      },
    };
  } catch (err) {
    // Graceful fallback when no LLM provider is configured
    return {
      text: "[No LLM provider configured]",
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}

export async function createEmbedding(text: string): Promise<number[]> {
  try {
    const result = await embed({
      model: embeddingModel,
      value: text,
    });
    return result.embedding;
  } catch {
    // Return zero-vector when embedding provider is unavailable (e.g. no API key)
    return new Array(1536).fill(0);
  }
}


export async function extractStructuredMemoryTriple(
  fact: string,
  kind?: MemoryKind,
  tags?: string[],
): Promise<{ triple: { subject: string; predicate: string; object: string }; confidence: number; rationale?: string } | null> {
  try {
    const result = await generateObject({
      model: extractionModel,
      schema: extractedMemoryTripleSchema,
      prompt: `You convert a single memory statement into a strict subject/predicate/object triple for an AI memory system.

Rules:
- Return exactly one triple.
- subject should usually be "user" for user facts/preferences/goals, or a stable entity like "project" when appropriate.
- predicate must be one of: prefers, avoids, has_name, works_on, has_goal, has_constraint, has_code, states.
- object should be the normalized core value of the memory.
- Do not paraphrase into free-form summaries.
- Use the provided kind/tags as hints, but ground the triple in the fact text.

Fact: ${fact}
Kind: ${kind ?? "unknown"}
Tags: ${(tags ?? []).join(", ") || "none"}` ,
    });

    return result.object;
  } catch {
    return null;
  }
}

export async function extractMemoryFromConversation(
  conversation: string,
): Promise<{
  entities: Array<{ name: string; type: string; properties: Record<string, unknown> }>;
  relationships: Array<{
    source: string;
    target: string;
    type: string;
    properties: Record<string, unknown>;
  }>;
  userSignals: string[];
}> {
  const prompt = `You are an information extraction engine for an AI agent memory system.

Extract JSON with these top-level keys:
- entities: array of { name, type, properties }
- relationships: array of { source, target, type, properties }
- userSignals: array of concise bullet-like strings describing user preferences, work patterns, goals, or expertise learned from the conversation

Entity types should prefer: person, project, concept, tool, goal, preference, event.
Relationship types should prefer: works_on, uses, prefers, relates_to, has_goal, knows_about, depends_on.

Return ONLY valid JSON.

Conversation:
${conversation}`;

  try {
    const result = await generateText({
      model: extractionModel,
      prompt,
    });

    try {
      return JSON.parse(result.text);
    } catch {
      return { entities: [], relationships: [], userSignals: [] };
    }
  } catch {
    return { entities: [], relationships: [], userSignals: [] };
  }
}

export async function summarizeCommunity(
  name: string,
  entityNames: string[],
): Promise<string> {
  const prompt = `Summarize this memory community for an AI agent in 2-3 sentences.
Community name: ${name}
Entities: ${entityNames.join(", ")}`;

  try {
    const result = await generateText({
      model: extractionModel,
      prompt,
    });

    return result.text.trim();
  } catch {
    return `Community: ${name}`;
  }
}

export async function compressUserModel(
  currentModel: string,
  newSignals: string[],
): Promise<string> {
  const prompt = `You maintain a USER_MODEL.md style summary.
Merge the current model with the new signals and keep the result under ${config.KRAKEN_MAX_USER_MODEL_CHARS} characters.
Preserve only durable, useful information about communication style, expertise, work patterns, and goals.

Current model:
${currentModel || "(empty)"}

New signals:
${newSignals.map((s) => `- ${s}`).join("\n")}`;

  try {
    const result = await generateText({
      model: extractionModel,
      prompt,
    });

    return result.text.slice(0, config.KRAKEN_MAX_USER_MODEL_CHARS).trim();
  } catch {
    return currentModel || "";
  }
}

export interface DreamResult {
  entities: Array<{ name: string; type: string; properties: Record<string, unknown> }>;
  relationships: Array<{
    source: string;
    target: string;
    type: string;
    properties: Record<string, unknown>;
  }>;
  userSignals: string[];
  communityName?: string;
  communitySummary?: string;
  suggestedTools: Array<{
    name: string;
    description: string;
    instructions: string;
    tags?: string[];
  }>;
  suggestedSkills: Array<{
    name: string;
    content: string;
    tags?: string[];
  }>;
}

export async function dreamFromConversationWindow(
  conversation: string,
): Promise<DreamResult> {
  const prompt = `You are the offline dreaming and consolidation system for an AI agent memory.

Look at the recent conversation window and infer durable facts, latent patterns, and useful higher-level connections.
Do not hallucinate specifics. Only emit information that is plausibly supported by the text.

Also look for repeatable procedures, workflows, or capabilities that came up in conversation.
If users asked for something that required a specific process or integration, suggest creating a tool or skill for it so the agent can handle it better next time.

- Tools are executable capabilities with a name, description, instructions, and optional tags.
- Skills are knowledge/instruction sets with a name, content (markdown), and optional tags.

Only suggest tools/skills that would genuinely be reusable. Do not suggest trivial or overly generic ones.

Return ONLY valid JSON with these keys:
- entities: array of { name, type, properties }
- relationships: array of { source, target, type, properties }
- userSignals: array of concise durable user facts/preferences/goals/work patterns
- communityName: short label for the dominant theme
- communitySummary: 2-3 sentence summary of the higher-level pattern
- suggestedTools: array of { name, description, instructions, tags } — reusable executable procedures inferred from conversations
- suggestedSkills: array of { name, content, tags } — reusable knowledge or instruction sets inferred from conversations

Conversation window:
${conversation}`;

  try {
    const result = await generateText({
      model: extractionModel,
      prompt,
    });

    try {
      return JSON.parse(result.text);
    } catch {
      return { entities: [], relationships: [], userSignals: [], suggestedTools: [], suggestedSkills: [] };
    }
  } catch {
    return { entities: [], relationships: [], userSignals: [], suggestedTools: [], suggestedSkills: [] };
  }
}

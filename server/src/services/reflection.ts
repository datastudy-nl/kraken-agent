/**
 * Skill self-improvement — autonomous post-conversation reflection.
 *
 * After conversations with significant tool usage, error recovery, or user
 * corrections, the agent reflects on what it learned and auto-creates or
 * patches skills so it performs better next time.
 */
import { config } from "../config.js";
import { runChat } from "./llm.js";
import { createSkill, listSkills, updateSkill, getSkill } from "./skills.js";

export interface ReflectionInput {
  sessionId: string;
  messages: Array<{ role: string; content: string }>;
  toolCallCount: number;
  hasErrors: boolean;
}

export interface ReflectionResult {
  reflected: boolean;
  action: "created" | "patched" | "skipped";
  skillName?: string;
  skillId?: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Trigger detection
// ---------------------------------------------------------------------------

/**
 * Determine whether a conversation warrants reflection.
 * Triggers: high tool usage, error-then-fix patterns, or user corrections.
 */
export function shouldReflect(
  messages: Array<{ role: string; content: string }>,
  toolCallCount: number,
  hasErrors: boolean,
): boolean {
  if (!config.KRAKEN_SKILL_AUTO_CREATE) return false;
  if (toolCallCount >= config.KRAKEN_SKILL_MIN_TOOL_CALLS) return true;
  if (hasErrors) return true;

  // Check for user correction patterns
  const corrections = messages.filter(
    (m) =>
      m.role === "user" &&
      /\b(no[,.]?\s+(actually|instead|use|do|try)|wrong|incorrect|that's not|not what I|should be|rather|fix that)\b/i.test(
        m.content,
      ),
  );
  return corrections.length >= 2;
}

// ---------------------------------------------------------------------------
// Reflection
// ---------------------------------------------------------------------------

export async function reflectAndImprove(
  input: ReflectionInput,
): Promise<ReflectionResult> {
  const { sessionId, messages, toolCallCount, hasErrors } = input;

  if (!shouldReflect(messages, toolCallCount, hasErrors)) {
    return { reflected: false, action: "skipped", reason: "Below reflection thresholds" };
  }

  const conversation = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const reflectionPrompt = `You are a self-improvement reflection system for an AI agent.

Analyze this conversation and determine if a REUSABLE procedure or knowledge was discovered.

Look for:
1. Repeatable procedures that worked (multi-step workflows, API integrations, deployment steps)
2. Errors that were fixed — what was the correct approach?
3. User corrections — what did the user teach you?
4. Non-obvious gotchas or best practices discovered

Context:
- Tool calls made: ${toolCallCount}
- Errors encountered: ${hasErrors ? "yes" : "no"}

Return ONLY valid JSON with these keys:
- shouldCreateSkill: boolean — true only if a genuinely reusable procedure/knowledge was discovered
- shouldPatchExisting: boolean — true if an existing skill should be updated instead of creating new
- existingSkillName: string — name of skill to patch (empty string if creating new)
- skillName: string — short descriptive name for the skill (e.g. "Deploy Django to AWS", "OAuth2 PKCE Flow")
- skillContent: string — full markdown content: steps, code examples, gotchas, verification steps
- skillTags: string[] — categorization tags
- reason: string — brief explanation of why this should/shouldn't become a skill

Conversation:
${conversation}`;

  try {
    const result = await runChat({
      system: "You are a reflection engine. Output only valid JSON.",
      messages: [{ role: "user" as const, content: reflectionPrompt }],
    });

    let reflection: {
      shouldCreateSkill: boolean;
      shouldPatchExisting: boolean;
      existingSkillName: string;
      skillName: string;
      skillContent: string;
      skillTags: string[];
      reason: string;
    };

    try {
      reflection = JSON.parse(result.text);
    } catch {
      return { reflected: false, action: "skipped", reason: "Failed to parse reflection output" };
    }

    if (!reflection.shouldCreateSkill && !reflection.shouldPatchExisting) {
      return {
        reflected: true,
        action: "skipped",
        reason: reflection.reason || "Reflection determined no skill needed",
      };
    }

    // --- Patch existing skill ---
    if (reflection.shouldPatchExisting && reflection.existingSkillName) {
      const existing = await listSkills({ search: reflection.existingSkillName });
      const match = existing.skills.find(
        (s) => s.name.toLowerCase() === reflection.existingSkillName.toLowerCase(),
      );

      if (match) {
        const merged = `${match.content}\n\n## Updated (auto-learned)\n\n${reflection.skillContent}`;
        await updateSkill(match.id, { content: merged });
        console.log(`[reflection] Patched skill: ${match.name} (v${match.version + 1})`);
        return {
          reflected: true,
          action: "patched",
          skillName: match.name,
          skillId: match.id,
          reason: reflection.reason,
        };
      }
      // If the skill to patch doesn't exist, fall through to creation
    }

    // --- Create new skill (with dedup check) ---
    if (reflection.skillName && reflection.skillContent) {
      // Check for duplicates by name
      const existing = await listSkills({ search: reflection.skillName });
      const duplicate = existing.skills.find(
        (s) => s.name.toLowerCase() === reflection.skillName.toLowerCase(),
      );

      if (duplicate) {
        console.log(`[reflection] Skipped duplicate skill: ${reflection.skillName}`);
        return {
          reflected: true,
          action: "skipped",
          reason: `Skill "${reflection.skillName}" already exists`,
        };
      }

      const created = await createSkill({
        name: reflection.skillName,
        content: reflection.skillContent,
        tags: [...(reflection.skillTags || []), "auto-learned"],
      });

      console.log(`[reflection] Created skill: ${created.name}`);
      return {
        reflected: true,
        action: "created",
        skillName: created.name,
        skillId: created.id,
        reason: reflection.reason,
      };
    }

    return {
      reflected: true,
      action: "skipped",
      reason: reflection.reason || "No actionable skill content",
    };
  } catch (err) {
    console.error("[reflection] Error:", err);
    return {
      reflected: false,
      action: "skipped",
      reason: `Reflection error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

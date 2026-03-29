import { and, desc, eq, ilike } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { createEmbedding } from "./llm.js";
import { semanticSearch } from "./vector.js";

export async function listSkills(filters: {
  tag?: string | null;
  search?: string | null;
}): Promise<{ skills: any[]; total: number }> {
  const conditions = [] as any[];

  if (filters.search) {
    conditions.push(ilike(schema.skills.name, `%${filters.search}%`));
  }

  const rows = await db.select().from(schema.skills).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(schema.skills.updatedAt));

  let filtered = rows;
  if (filters.tag) {
    filtered = rows.filter((row) => Array.isArray(row.tags) && row.tags.includes(filters.tag));
  }

  return {
    skills: filtered.map((row) => ({
      id: row.id,
      name: row.name,
      content: row.content,
      tags: row.tags,
      version: row.version,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    })),
    total: filtered.length,
  };
}

export async function createSkill(input: {
  name: string;
  content: string;
  tags?: string[];
}) {
  const embedding = await createEmbedding(`${input.name}\n${input.content}`);
  const [row] = await db
    .insert(schema.skills)
    .values({
      name: input.name,
      content: input.content,
      tags: input.tags ?? [],
      embedding,
    })
    .returning();

  return {
    id: row.id,
    name: row.name,
    content: row.content,
    tags: row.tags,
    version: row.version,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function getSkill(id: string) {
  const row = await db.query.skills.findFirst({ where: eq(schema.skills.id, id) });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    tags: row.tags,
    version: row.version,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function updateSkill(
  id: string,
  input: { content?: string; tags?: string[] },
) {
  const existing = await db.query.skills.findFirst({ where: eq(schema.skills.id, id) });
  if (!existing) return null;

  const content = input.content ?? existing.content;
  const tags = input.tags ?? existing.tags;
  const embedding = await createEmbedding(`${existing.name}\n${content}`);

  const [row] = await db
    .update(schema.skills)
    .set({
      content,
      tags,
      version: existing.version + 1,
      embedding,
      updatedAt: new Date(),
    })
    .where(eq(schema.skills.id, id))
    .returning();

  return {
    id: row.id,
    name: row.name,
    content: row.content,
    tags: row.tags,
    version: row.version,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function deleteSkill(id: string): Promise<boolean> {
  const rows = await db.delete(schema.skills).where(eq(schema.skills.id, id)).returning();
  return rows.length > 0;
}

export async function getRelevantSkills(query: string, limit: number): Promise<string[]> {
  // Always fetch full inventory so the LLM knows what skills exist
  const { skills: allSkills } = await listSkills({ tag: null });
  const embedding = await createEmbedding(query);
  const result = await semanticSearch("skills", embedding, limit);
  const rows = result.rows as Array<Record<string, unknown>>;

  const lines: string[] = [];

  // Full inventory (always present)
  if (allSkills.length > 0) {
    lines.push(
      "## Available Skills\n\n" +
        allSkills.map((s) => `- **${s.name}**`).join("\n"),
    );
  }

  // Detailed info for semantically relevant skills
  if (rows.length > 0) {
    for (const row of rows) {
      lines.push(`# Skill: ${String(row.name)}\n\n${String(row.content)}`);
    }
  } else {
    // Fallback to text search
    const fallback = await listSkills({ search: query, tag: null });
    for (const skill of fallback.skills.slice(0, limit)) {
      lines.push(`# Skill: ${skill.name}\n\n${skill.content}`);
    }
  }

  return lines;
}

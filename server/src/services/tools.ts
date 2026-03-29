import { and, desc, eq, ilike } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { createEmbedding } from "./llm.js";
import { semanticSearch } from "./vector.js";

export interface ToolInput {
  name: string;
  description: string;
  instructions: string;
  inputSchema?: Record<string, unknown>;
  tags?: string[];
}

async function semanticSearchTools(query: string, limit: number) {
  const embedding = await createEmbedding(query);
  const result = await semanticSearch("tools", embedding, limit);

  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    description: String(row.description),
    instructions: String(row.instructions),
    input_schema: (row.input_schema ?? {}) as Record<string, unknown>,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
    distance: Number(row.distance ?? 0),
  }));
}

export async function listTools(filters: {
  tag?: string | null;
  search?: string | null;
  limit?: number;
}) {
  const conditions = [] as any[];

  if (filters.search) {
    conditions.push(ilike(schema.tools.name, `%${filters.search}%`));
  }

  const rows = await db
    .select()
    .from(schema.tools)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.tools.updatedAt))
    .limit(filters.limit ?? 100);

  let filtered = rows;
  if (filters.tag) {
    filtered = rows.filter((row) => Array.isArray(row.tags) && row.tags.includes(filters.tag));
  }

  return {
    tools: filtered.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      instructions: row.instructions,
      input_schema: row.inputSchema,
      tags: row.tags,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    })),
    total: filtered.length,
  };
}

export async function createTool(input: ToolInput) {
  const embedding = await createEmbedding(
    `${input.name}\n${input.description}\n${input.instructions}\n${(input.tags ?? []).join(" ")}`,
  );

  const [row] = await db
    .insert(schema.tools)
    .values({
      name: input.name,
      description: input.description,
      instructions: input.instructions,
      inputSchema: input.inputSchema ?? {},
      tags: input.tags ?? [],
      embedding,
    })
    .returning();

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    input_schema: row.inputSchema,
    tags: row.tags,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function getTool(id: string) {
  const row = await db.query.tools.findFirst({ where: eq(schema.tools.id, id) });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    input_schema: row.inputSchema,
    tags: row.tags,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function updateTool(
  id: string,
  input: Partial<ToolInput>,
) {
  const existing = await db.query.tools.findFirst({ where: eq(schema.tools.id, id) });
  if (!existing) return null;

  const updated = {
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    instructions: input.instructions ?? existing.instructions,
    inputSchema: input.inputSchema ?? existing.inputSchema,
    tags: (input.tags ?? existing.tags ?? []) as string[],
  };

  const embedding = await createEmbedding(
    `${updated.name}\n${updated.description}\n${updated.instructions}\n${(updated.tags ?? []).join(" ")}`,
  );

  const [row] = await db
    .update(schema.tools)
    .set({
      ...updated,
      embedding,
      updatedAt: new Date(),
    })
    .where(eq(schema.tools.id, id))
    .returning();

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    input_schema: row.inputSchema,
    tags: row.tags,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function deleteTool(id: string): Promise<boolean> {
  const rows = await db.delete(schema.tools).where(eq(schema.tools.id, id)).returning();
  return rows.length > 0;
}

export async function getRelevantTools(query: string, limit: number): Promise<string[]> {
  // Always fetch full inventory so the LLM knows what tools exist
  const { tools: allTools } = await listTools({ limit: 100 });
  const ranked = await semanticSearchTools(query, limit);

  const lines: string[] = [];

  // Full inventory (always present)
  if (allTools.length > 0) {
    lines.push(
      "## Available Tools\n\n" +
        allTools.map((t) => `- **${t.name}**: ${t.description}`).join("\n"),
    );
  }

  // Detailed info for semantically relevant tools
  for (const tool of ranked) {
    lines.push(
      `# Tool: ${tool.name}\n\nDescription: ${tool.description}\n\nInstructions:\n${tool.instructions}`,
    );
  }

  return lines;
}

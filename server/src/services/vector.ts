import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { createEmbedding } from "./llm.js";

export function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

export async function semanticSearch(
  tableName: "skills" | "tools",
  queryEmbedding: number[],
  limit: number,
) {
  const literal = vectorLiteral(queryEmbedding);
  return db.execute(sql.raw(`
    SELECT *, embedding <=> '${literal}'::vector AS distance
    FROM ${tableName}
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> '${literal}'::vector
    LIMIT ${limit}
  `));
}

/**
 * Hybrid search over the messages table using Reciprocal Rank Fusion (RRF).
 * Combines PostgreSQL full-text search (keyword) with pgvector cosine
 * similarity (semantic) for higher-quality episodic memory recall.
 * Includes a recency boost so recently-told facts surface more readily.
 */
export async function hybridSearch(
  query: string,
  limit: number,
  k: number = 60, // RRF constant
): Promise<
  Array<{
    id: string;
    session_id: string;
    role: string;
    content: string;
    created_at: string;
    metadata: Record<string, unknown>;
  }>
> {
  let queryEmbedding: number[];
  try {
    queryEmbedding = await createEmbedding(query);
  } catch {
    // If embedding fails, return empty — caller will fall back to FTS-only
    return [];
  }

  const literal = vectorLiteral(queryEmbedding);

  // Use parameterized query for FTS to prevent SQL injection.
  // Recency boost: add a small score bonus for messages from the last 24h,
  // decaying over 7 days, so recent facts are preferred when relevance is similar.
  const result = await db.execute(sql`
    WITH fts AS (
      SELECT id, session_id, role, content, created_at, metadata,
             ROW_NUMBER() OVER (ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${query})) DESC) AS rn
      FROM messages
      WHERE search_vector @@ plainto_tsquery('english', ${query})
      LIMIT 50
    ),
    vec AS (
      SELECT id, session_id, role, content, created_at, metadata,
             ROW_NUMBER() OVER (ORDER BY embedding <=> ${literal}::vector) AS rn
      FROM messages
      WHERE embedding IS NOT NULL
      LIMIT 50
    ),
    combined AS (
      SELECT id, session_id, role, content, created_at, metadata,
             COALESCE(1.0 / (${k} + fts.rn), 0) + COALESCE(1.0 / (${k} + vec.rn), 0)
             + 0.005 * GREATEST(0, 1.0 - EXTRACT(EPOCH FROM (now() - COALESCE(fts.created_at, vec.created_at))) / 604800.0)
             AS rrf_score
      FROM fts
      FULL OUTER JOIN vec USING (id, session_id, role, content, created_at, metadata)
    )
    SELECT * FROM combined
    ORDER BY rrf_score DESC
    LIMIT ${limit}
  `);

  return (result.rows as any[]).map((row) => ({
    id: row.id,
    session_id: row.session_id,
    role: row.role,
    content: row.content,
    created_at: new Date(row.created_at).toISOString(),
    metadata: row.metadata ?? {},
  }));
}

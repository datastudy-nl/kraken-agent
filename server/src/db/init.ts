import { sql } from "drizzle-orm";
import { db } from "./index.js";

export async function initPostgresSchema(): Promise<void> {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_key text,
      name text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    )
  `);

  await db.execute(sql`
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_key text
  `);
  await db.execute(sql`
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS name text
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS sessions_session_key_idx ON sessions(session_key)
    WHERE session_key IS NOT NULL
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role text NOT NULL,
      content text NOT NULL,
      tool_calls jsonb DEFAULT '[]'::jsonb,
      tool_results jsonb DEFAULT '[]'::jsonb,
      model text,
      token_count integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS messages_session_idx ON messages(session_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS messages_created_idx ON messages(created_at)
  `);



  // --- Curated memory items ---
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS memory_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
      kind text NOT NULL,
      status text NOT NULL DEFAULT 'active',
      scope text NOT NULL DEFAULT 'user',
      source_type text NOT NULL,
      content text NOT NULL,
      tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      confidence integer NOT NULL DEFAULT 100,
      importance integer NOT NULL DEFAULT 80,
      reuse_count integer NOT NULL DEFAULT 0,
      last_retrieved_at timestamptz,
      last_confirmed_at timestamptz,
      expires_at timestamptz,
      superseded_by uuid,
      embedding vector(1536),
      search_vector tsvector,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS memory_items_status_idx ON memory_items(status)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS memory_items_scope_idx ON memory_items(scope)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS memory_items_created_idx ON memory_items(created_at)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS memory_items_embedding_idx
    ON memory_items USING ivfflat (embedding vector_cosine_ops)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS memory_items_search_idx
    ON memory_items USING gin(search_vector)
  `);
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION memory_items_search_trigger() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, ''));
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `);
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'memory_items_search_update'
      ) THEN
        CREATE TRIGGER memory_items_search_update
        BEFORE INSERT OR UPDATE ON memory_items
        FOR EACH ROW EXECUTE FUNCTION memory_items_search_trigger();
      END IF;
    END $$
  `);
  await db.execute(sql`
    UPDATE memory_items SET search_vector = to_tsvector('english', content)
    WHERE search_vector IS NULL
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS skills (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL UNIQUE,
      content text NOT NULL,
      tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      version integer NOT NULL DEFAULT 1,
      embedding vector(1536),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS skills_name_idx ON skills(name)
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tools (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL UNIQUE,
      description text NOT NULL,
      instructions text NOT NULL,
      input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
      tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      embedding vector(1536),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS tools_name_idx ON tools(name)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS identity (
      key text PRIMARY KEY,
      content text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS skills_embedding_idx
    ON skills USING ivfflat (embedding vector_cosine_ops)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS tools_embedding_idx
    ON tools USING ivfflat (embedding vector_cosine_ops)
  `);

  // --- Full-text search for episodic memory (Step 1) ---
  await db.execute(sql`
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_vector tsvector
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS messages_search_idx
    ON messages USING gin(search_vector)
  `);
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION messages_search_trigger() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, ''));
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `);
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'messages_search_update'
      ) THEN
        CREATE TRIGGER messages_search_update
        BEFORE INSERT OR UPDATE ON messages
        FOR EACH ROW EXECUTE FUNCTION messages_search_trigger();
      END IF;
    END $$
  `);
  // Backfill existing rows that have no search_vector
  await db.execute(sql`
    UPDATE messages SET search_vector = to_tsvector('english', content)
    WHERE search_vector IS NULL
  `);

  // --- Hybrid search: message embeddings (Step 2) ---
  await db.execute(sql`
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS embedding vector(1536)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS messages_embedding_idx
    ON messages USING ivfflat (embedding vector_cosine_ops)
  `);

  // --- Session personality overlay (Step 5) ---
  await db.execute(sql`
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS personality text
  `);

  // --- Session lifecycle (Step 7) ---
  await db.execute(sql`
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_active_at timestamptz DEFAULT now()
  `);
  await db.execute(sql`
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS sessions_archived_idx ON sessions(archived)
  `);

  // --- Identity links for cross-platform user recognition (Step 12) ---
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS identity_links (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      canonical_user_id text NOT NULL,
      provider text NOT NULL,
      provider_user_id text NOT NULL,
      display_name text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(provider, provider_user_id)
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS identity_links_canonical_idx
    ON identity_links(canonical_user_id)
  `);

  // --- Schedules ---
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS schedules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      description text NOT NULL DEFAULT '',
      cron_expression text NOT NULL,
      task_prompt text NOT NULL,
      origin_session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
      enabled boolean NOT NULL DEFAULT true,
      last_run_at timestamptz,
      next_run_at timestamptz,
      run_count integer NOT NULL DEFAULT 0,
      max_runs integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS schedules_next_run_idx ON schedules(next_run_at)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS schedules_enabled_idx ON schedules(enabled)
  `);

  // --- Migrate schedules.enabled from integer to boolean ---
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'schedules' AND column_name = 'enabled' AND data_type = 'integer'
      ) THEN
        ALTER TABLE schedules
          ALTER COLUMN enabled DROP DEFAULT,
          ALTER COLUMN enabled SET DATA TYPE boolean USING (enabled = 1),
          ALTER COLUMN enabled SET DEFAULT true;
      END IF;
    END $$
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS secrets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL UNIQUE,
      encrypted_value text NOT NULL,
      description text,
      allowed_tools jsonb,
      last_used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS secrets_name_idx ON secrets(name)
  `);
}

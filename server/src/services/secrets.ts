import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { secrets } from "../db/schema.js";
import { config } from "../config.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  if (!config.KRAKEN_SECRET_KEY) {
    throw new Error("KRAKEN_SECRET_KEY is required for the secret store. Set it in your environment.");
  }
  return crypto.createHash("sha256").update(config.KRAKEN_SECRET_KEY).digest();
}

function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store as: base64(iv + tag + ciphertext)
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decrypt(encoded: string): string {
  const key = getKey();
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

export async function listSecrets() {
  const rows = await db
    .select({
      id: secrets.id,
      name: secrets.name,
      description: secrets.description,
      allowedTools: secrets.allowedTools,
      lastUsedAt: secrets.lastUsedAt,
      createdAt: secrets.createdAt,
      updatedAt: secrets.updatedAt,
    })
    .from(secrets)
    .orderBy(secrets.name);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    allowed_tools: r.allowedTools as string[] | null,
    last_used_at: r.lastUsedAt?.toISOString() ?? null,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  }));
}

export async function createSecret(data: {
  name: string;
  value: string;
  description?: string;
  allowedTools?: string[];
}) {
  const encryptedValue = encrypt(data.value);
  const [row] = await db
    .insert(secrets)
    .values({
      name: data.name,
      encryptedValue,
      description: data.description ?? null,
      allowedTools: data.allowedTools ?? null,
    })
    .returning();
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    allowed_tools: row.allowedTools as string[] | null,
    created_at: row.createdAt.toISOString(),
  };
}

export async function updateSecret(
  id: string,
  data: { value?: string; description?: string; allowedTools?: string[] },
) {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.value !== undefined) updates.encryptedValue = encrypt(data.value);
  if (data.description !== undefined) updates.description = data.description;
  if (data.allowedTools !== undefined) updates.allowedTools = data.allowedTools;

  const [row] = await db.update(secrets).set(updates).where(eq(secrets.id, id)).returning();
  if (!row) throw new Error("Secret not found");
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    allowed_tools: row.allowedTools as string[] | null,
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function deleteSecret(id: string): Promise<boolean> {
  const result = await db.delete(secrets).where(eq(secrets.id, id)).returning({ id: secrets.id });
  return result.length > 0;
}

/**
 * Decrypt a secret by name. For use by LLM tools only — never expose via API.
 * Validates allowed_tools if set.
 */
export async function getSecretValue(name: string, callingTool?: string): Promise<string> {
  const [row] = await db
    .select()
    .from(secrets)
    .where(eq(secrets.name, name))
    .limit(1);

  if (!row) throw new Error(`Secret "${name}" not found`);

  // Check tool access restriction
  const allowed = row.allowedTools as string[] | null;
  if (allowed && allowed.length > 0 && callingTool) {
    if (!allowed.includes(callingTool)) {
      throw new Error(`Tool "${callingTool}" is not authorized to access secret "${name}"`);
    }
  }

  // Update last_used_at
  await db.update(secrets).set({ lastUsedAt: new Date() }).where(eq(secrets.id, row.id));

  return decrypt(row.encryptedValue);
}

#!/usr/bin/env node
/**
 * Re-encrypt every vault-backed database value with the current primary key.
 *
 * Required environment:
 *   DATABASE_URL
 *   SUPARBASE_ENCRYPTION_KEY      new 32-byte base64 key
 *   SUPARBASE_ENCRYPTION_KEY_OLD  previous 32-byte base64 key
 *
 * The operation is idempotent and transactional. Blobs already encrypted by
 * the new key are counted but not rewritten. No plaintext or key material is
 * printed. Run with --dry-run first to validate every stored blob.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import postgres from "postgres";

const IV_LEN = 12;
const TAG_LEN = 16;
const VERSION = 1;
const dryRun = process.argv.includes("--dry-run");

const targets = [
  { table: "connections", key: "id", columns: ["encrypted_key", "encrypted_postgres_url"] },
  { table: "user_settings", key: "user_id", columns: ["encrypted_openrouter_key"] },
  { table: "users", key: "id", columns: ["totp_secret_encrypted"] },
  { table: "custom_actions", key: "id", columns: ["webhook_headers_encrypted"] },
];

function envKey(name) {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is required.`);
  const value = Buffer.from(raw, "base64");
  if (value.length !== 32) {
    throw new Error(`${name} must decode to exactly 32 bytes.`);
  }
  return value;
}

function decrypt(blob, key) {
  try {
    const value = Buffer.from(blob);
    if (value.length < 1 + IV_LEN + TAG_LEN || value[0] !== VERSION) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, value.subarray(1, 1 + IV_LEN));
    decipher.setAuthTag(value.subarray(value.length - TAG_LEN));
    return Buffer.concat([
      decipher.update(value.subarray(1 + IV_LEN, value.length - TAG_LEN)),
      decipher.final(),
    ]);
  } catch {
    return null;
  }
}

function encrypt(plaintext, key) {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, ciphertext, tag]);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const primary = envKey("SUPARBASE_ENCRYPTION_KEY");
  const previous = envKey("SUPARBASE_ENCRYPTION_KEY_OLD");
  if (primary.equals(previous)) {
    throw new Error("The current and previous encryption keys must be different.");
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  const counts = { scanned: 0, alreadyCurrent: 0, rotated: 0 };

  try {
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('suparbase:vault-key-rotation'))`;

      for (const target of targets) {
        const selected = [target.key, ...target.columns].map((name) => `"${name}"`).join(", ");
        const rows = await tx.unsafe(`select ${selected} from "${target.table}"`);

        for (const row of rows) {
          for (const column of target.columns) {
            const blob = row[column];
            if (!blob) continue;
            counts.scanned += 1;

            if (decrypt(blob, primary) !== null) {
              counts.alreadyCurrent += 1;
              continue;
            }
            const plaintext = decrypt(blob, previous);
            if (plaintext === null) {
              throw new Error(
                `Could not decrypt ${target.table}.${column} for row ${String(row[target.key])}. ` +
                  "The old key is incorrect or the ciphertext is corrupt.",
              );
            }

            if (!dryRun) {
              await tx.unsafe(
                `update "${target.table}" set "${column}" = $1 where "${target.key}" = $2`,
                [encrypt(plaintext, primary), row[target.key]],
              );
            }
            counts.rotated += 1;
          }
        }
      }
    });
  } finally {
    await sql.end({ timeout: 5 });
  }

  const mode = dryRun ? "validation" : "rotation";
  console.log(
    `[rotate-key] ${mode} complete: ${counts.scanned} encrypted values checked, ` +
      `${counts.rotated} ${dryRun ? "ready to rotate" : "rotated"}, ` +
      `${counts.alreadyCurrent} already current.`,
  );
}

main().catch((error) => {
  console.error(`[rotate-key] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

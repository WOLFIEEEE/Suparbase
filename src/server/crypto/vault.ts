import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Ciphertext layout: [version(1)] [iv(12)] [ciphertext(n)] [auth_tag(16)]
const VERSION_CURRENT = 1;
const IV_LEN = 12;
const TAG_LEN = 16;

function readEnvKey(name: string): Buffer | null {
  const raw = process.env[name];
  if (!raw) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(raw, "base64");
  } catch {
    throw new Error(`${name} is not valid base64`);
  }
  if (buf.length !== 32) {
    throw new Error(`${name} must decode to 32 bytes (got ${buf.length}); generate with: openssl rand -base64 32`);
  }
  return buf;
}

function primaryKey(): Buffer {
  const k = readEnvKey("SUPARBASE_ENCRYPTION_KEY");
  if (!k) {
    throw new Error("SUPARBASE_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32");
  }
  return k;
}

function previousKey(): Buffer | null {
  return readEnvKey("SUPARBASE_ENCRYPTION_KEY_OLD");
}

export function encryptKey(plaintext: string): Uint8Array {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", primaryKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const out = Buffer.alloc(1 + IV_LEN + ct.length + TAG_LEN);
  out.writeUInt8(VERSION_CURRENT, 0);
  iv.copy(out, 1);
  ct.copy(out, 1 + IV_LEN);
  tag.copy(out, 1 + IV_LEN + ct.length);
  return new Uint8Array(out);
}

function tryDecrypt(blob: Uint8Array, key: Buffer): string | null {
  try {
    const buf = Buffer.from(blob);
    const iv = buf.subarray(1, 1 + IV_LEN);
    const tag = buf.subarray(buf.length - TAG_LEN);
    const ct = buf.subarray(1 + IV_LEN, buf.length - TAG_LEN);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

export function decryptKey(blob: Uint8Array): string {
  if (blob.length < 1 + IV_LEN + TAG_LEN) {
    throw new Error("Encrypted key blob is malformed (too short).");
  }
  const version = blob[0];
  if (version === undefined) throw new Error("Encrypted key blob is empty.");

  const plain = tryDecrypt(blob, primaryKey());
  if (plain !== null) return plain;

  const old = previousKey();
  if (old) {
    const plainOld = tryDecrypt(blob, old);
    if (plainOld !== null) return plainOld;
  }
  throw new Error("Failed to decrypt credential. Encryption key may have rotated or the blob is corrupt.");
}

/**
 * Re-encrypt a blob with the primary key. Use during key rotation to migrate
 * rows from the old key to the new one, transparently to the rest of the app.
 */
export function reencryptKey(blob: Uint8Array): Uint8Array {
  return encryptKey(decryptKey(blob));
}

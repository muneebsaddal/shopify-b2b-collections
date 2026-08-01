import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const FORMAT_VERSION = "v1";

type KeyMaterial = {
  id: string;
  value: Buffer;
};

function loadSessionKey(): KeyMaterial {
  const encoded = process.env.SESSION_ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error("SESSION_ENCRYPTION_KEY is required");
  }

  const value = Buffer.from(encoded, "base64");
  if (value.length !== KEY_BYTES) {
    throw new Error(
      "SESSION_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  }

  return {
    id: process.env.SESSION_ENCRYPTION_KEY_ID || "primary",
    value,
  };
}

export function encryptSessionSecret(
  plaintext: string,
  context: string,
): string {
  const key = loadSessionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key.value, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    FORMAT_VERSION,
    key.id,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSessionSecret(
  envelope: string,
  context: string,
): string {
  const [version, keyId, encodedIv, encodedTag, encodedCiphertext, ...extra] =
    envelope.split(".");
  const key = loadSessionKey();

  if (
    version !== FORMAT_VERSION ||
    !keyId ||
    !encodedIv ||
    !encodedTag ||
    encodedCiphertext === undefined ||
    extra.length > 0
  ) {
    throw new Error("Invalid encrypted session value");
  }
  if (keyId !== key.id) {
    throw new Error("Encrypted session value uses an unavailable key");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    key.value,
    Buffer.from(encodedIv, "base64url"),
  );
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

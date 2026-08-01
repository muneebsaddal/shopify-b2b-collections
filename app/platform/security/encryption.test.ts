import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  decryptSessionSecret,
  encryptSessionSecret,
} from "./encryption.server";

const originalKey = process.env.SESSION_ENCRYPTION_KEY;
const originalKeyId = process.env.SESSION_ENCRYPTION_KEY_ID;

describe("session encryption", () => {
  beforeEach(() => {
    process.env.SESSION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.SESSION_ENCRYPTION_KEY_ID = "test-key";
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.SESSION_ENCRYPTION_KEY;
    } else {
      process.env.SESSION_ENCRYPTION_KEY = originalKey;
    }
    if (originalKeyId === undefined) {
      delete process.env.SESSION_ENCRYPTION_KEY_ID;
    } else {
      process.env.SESSION_ENCRYPTION_KEY_ID = originalKeyId;
    }
  });

  it("round trips a secret without exposing plaintext", () => {
    const encrypted = encryptSessionSecret(
      "shopify-secret",
      "shopify-session:test:access-token",
    );

    expect(encrypted).not.toContain("shopify-secret");
    expect(
      decryptSessionSecret(
        encrypted,
        "shopify-session:test:access-token",
      ),
    ).toBe("shopify-secret");
  });

  it("binds ciphertext to its encryption context", () => {
    const encrypted = encryptSessionSecret(
      "shopify-secret",
      "shopify-session:test:access-token",
    );

    expect(() =>
      decryptSessionSecret(
        encrypted,
        "shopify-session:other:access-token",
      ),
    ).toThrow();
  });

  it("rejects an invalid key size", () => {
    process.env.SESSION_ENCRYPTION_KEY = Buffer.from("too-short").toString(
      "base64",
    );

    expect(() => encryptSessionSecret("secret", "context")).toThrow(
      "32-byte key",
    );
  });
});

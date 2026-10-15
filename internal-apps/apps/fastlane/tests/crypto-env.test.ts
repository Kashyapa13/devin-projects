import { afterEach, describe, expect, it } from "vitest";
import { cipherFromEnv, kmsFromEnv, KEY_ID } from "../api/src/crypto.js";

/** api/src/crypto.ts — env-branch coverage (pure module, no I/O). */
const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("kmsFromEnv — provider selection by env", () => {
  it("prod wiring placeholders throw until the SDK client is injected", () => {
    process.env.KMS_KEY_ARN = "arn:aws:kms:us-east-1:1:key/x";
    process.env.AWS_KMS_ENDPOINT = "https://kms.local";
    expect(() => kmsFromEnv()).toThrowError(/AwsKmsProvider not wired|no SDK client wired/);
    delete process.env.AWS_KMS_ENDPOINT;
    expect(() => kmsFromEnv()).toThrowError(/AwsKmsProvider not wired/);
  });
  it("dev falls back to InMemoryKMS under the fastlane-legal-name key id", async () => {
    delete process.env.KMS_KEY_ARN;
    delete process.env.AWS_KMS_ENDPOINT;
    const kms = kmsFromEnv();
    const cipher = cipherFromEnv();
    expect(cipher.keyId).toBe(KEY_ID);
    const enc = await cipher.encrypt("SYNTH");
    expect(await cipher.decrypt(enc)).toBe("SYNTH");
    expect(kms).toBeTruthy();
  });
  it("DEV_KMS_KEY hex fixture is honored (deterministic dev key)", () => {
    delete process.env.KMS_KEY_ARN;
    process.env.DEV_KMS_KEY = "ab".repeat(32);
    const kms = kmsFromEnv();
    expect(kms).toBeTruthy();
  });
});

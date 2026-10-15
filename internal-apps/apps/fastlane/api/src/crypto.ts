import {
  AwsKmsProvider,
  InMemoryKMS,
  fieldCipher,
  type FieldCipher,
  type KmsProvider,
} from "@company/crypto";

export const KEY_ID = "fastlane-legal-name";

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * KMS provider from env. Prod: AWS KMS via AwsKmsProvider with the
 * account's SDK client (wired at deploy — the SDK isn't an app dep yet;
 * see infra/ENVIRONMENTS.md for KMS_KEY_ARN). Dev/test: deterministic
 * InMemoryKMS so seed ciphertext decrypts under the server's cipher —
 * the zero key is a fixture, never a secret.
 */
export function kmsFromEnv(): KmsProvider {
  const arn = process.env.KMS_KEY_ARN;
  if (arn && process.env.AWS_KMS_ENDPOINT) {
    // AwsKmsProvider wraps an AwsKmsClientLike {generateDataKey,decrypt} —
    // production injects the real client at the deploy boundary.
    throw new Error(
      "AWS_KMS_ENDPOINT set but no SDK client wired — see ADR-0004/deploy config",
    );
  }
  if (arn) {
    // AWS creds present → this error is intentional until the SDK client
    // is injected; silence it only by wiring AwsKmsProvider properly.
    throw new Error("KMS_KEY_ARN set but AwsKmsProvider not wired");
  }
  const devKey =
    process.env.DEV_KMS_KEY ?? "00".repeat(32); // fixture key, test/dev only
  return new InMemoryKMS({ [KEY_ID]: hexToBytes(devKey) });
}

export function cipherFromEnv(): FieldCipher {
  return fieldCipher(kmsFromEnv(), KEY_ID);
}

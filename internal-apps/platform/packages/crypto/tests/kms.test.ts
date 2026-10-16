import { describe, expect, it } from "vitest";
import {
  AwsKmsProvider,
  InMemoryKMS,
  type AwsKmsClientLike,
} from "../src/kms.js";

describe("InMemoryKMS", () => {
  it("wraps and unwraps data keys under the named master", async () => {
    const kms = new InMemoryKMS();
    kms.addKey("k");
    const dk = await kms.generateDataKey("k");
    expect(dk.plaintext).toHaveLength(32);
    await expect(kms.decryptDataKey(dk.ciphertext, "k")).resolves.toEqual(
      dk.plaintext,
    );
  });

  it("refuses unknown keyIds", async () => {
    const kms = new InMemoryKMS();
    await expect(kms.generateDataKey("missing")).rejects.toThrow(
      /unknown keyId/,
    );
  });
});

describe("AwsKmsProvider", () => {
  it("delegates GenerateDataKey/Decrypt to the injected client", async () => {
    const calls: string[] = [];
    const fake: AwsKmsClientLike = {
      async generateDataKey(input) {
        calls.push(`gen:${input.KeyId}:${input.KeySpec}`);
        return {
          Plaintext: new Uint8Array(32).fill(7),
          CiphertextBlob: new Uint8Array([1, 2, 3]),
        };
      },
      async decrypt(input) {
        calls.push(`dec:${input.KeyId}`);
        return { Plaintext: new Uint8Array(32).fill(9) };
      },
    };
    const provider = new AwsKmsProvider(fake);
    const dk = await provider.generateDataKey("arn:kms:key-1");
    expect(dk.ciphertext).toEqual(new Uint8Array([1, 2, 3]));
    await provider.decryptDataKey(dk.ciphertext, "arn:kms:key-1");
    expect(calls).toEqual(["gen:arn:kms:key-1:AES_256", "dec:arn:kms:key-1"]);
  });
});

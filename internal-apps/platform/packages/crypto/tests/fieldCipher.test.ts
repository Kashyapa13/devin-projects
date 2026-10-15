import { describe, expect, it } from "vitest";
import { InMemoryKMS } from "../src/kms.js";
import { fieldCipher } from "../src/fieldCipher.js";

function makeKms() {
  const kms = new InMemoryKMS();
  kms.addKey("key-1");
  kms.addKey("key-2");
  return kms;
}

describe("fieldCipher", () => {
  it("roundtrips plaintext through the envelope", async () => {
    const cipher = fieldCipher(makeKms(), "key-1");
    const token = await cipher.encrypt("sensitive-c4-payload");
    expect(token).not.toContain("sensitive-c4-payload");
    await expect(cipher.decrypt(token)).resolves.toBe(
      "sensitive-c4-payload",
    );
  });

  it("detects tampering via the GCM auth tag", async () => {
    const cipher = fieldCipher(makeKms(), "key-1");
    const token = await cipher.encrypt("integrity-check");
    const raw = Buffer.from(token, "base64url");
    // flip a byte inside the encoded envelope
    raw[Math.floor(raw.length / 2)] ^= 0xff;
    const forged = raw.toString("base64url");
    await expect(cipher.decrypt(forged)).rejects.toThrow();
  });

  it("reads old ciphertext after rotation; new writes use the new kid", async () => {
    const kms = makeKms();
    const cipher = fieldCipher(kms, "key-1");
    const before = await cipher.encrypt("written-under-key-1");

    cipher.rotateTo("key-2");
    // rotation reads old ciphertext — kid travels inside the envelope
    await expect(cipher.decrypt(before)).resolves.toBe(
      "written-under-key-1",
    );

    const after = await cipher.encrypt("written-under-key-2");
    const env = JSON.parse(
      Buffer.from(after, "base64url").toString("utf8"),
    ) as { kid: string };
    expect(env.kid).toBe("key-2");
    await expect(cipher.decrypt(after)).resolves.toBe(
      "written-under-key-2",
    );
  });

  it("fails closed on an unknown envelope version", async () => {
    const cipher = fieldCipher(makeKms(), "key-1");
    const forged = Buffer.from(
      JSON.stringify({ v: 99, kid: "key-1", edk: "", iv: "", ct: "" }),
    ).toString("base64url");
    await expect(cipher.decrypt(forged)).rejects.toThrow(/envelope/);
  });
});

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import type { KmsProvider } from "./kms.js";

const IV_LEN = 12;
const GCM_TAG_LEN = 16;

interface EnvelopeV1 {
  v: 1;
  kid: string;
  /** base64url encrypted data key */
  edk: string;
  /** base64url IV */
  iv: string;
  /** base64url ciphertext + auth tag */
  ct: string;
}

export interface FieldCipher {
  readonly keyId: string;
  encrypt(plaintext: string): Promise<string>;
  decrypt(token: string): Promise<string>;
  /** Point new writes at a new keyId; old ciphertext stays decryptable via its embedded kid. */
  rotateTo(nextKeyId: string): void;
}

/**
 * AES-256-GCM field cipher with KMS envelope encryption.
 * Envelope format (base64url JSON): {v, kid, edk, iv, ct}.
 * kid travels inside the envelope, so rotation needs no re-encryption:
 * old ciphertext unwraps under its original key while new writes use the
 * rotated keyId.
 */
export function fieldCipher(kms: KmsProvider, keyId: string): FieldCipher {
  let currentKeyId = keyId;

  return {
    get keyId() {
      return currentKeyId;
    },

    async encrypt(plaintext: string): Promise<string> {
      const dataKey = await kms.generateDataKey(currentKeyId);
      try {
        const iv = randomBytes(IV_LEN);
        const cipher = createCipheriv(
          "aes-256-gcm",
          Buffer.from(dataKey.plaintext),
          iv,
        );
        const body = Buffer.concat([
          cipher.update(plaintext, "utf8"),
          cipher.final(),
        ]);
        const envelope: EnvelopeV1 = {
          v: 1,
          kid: currentKeyId,
          edk: Buffer.from(dataKey.ciphertext).toString("base64url"),
          iv: iv.toString("base64url"),
          ct: Buffer.concat([body, cipher.getAuthTag()]).toString(
            "base64url",
          ),
        };
        return Buffer.from(JSON.stringify(envelope)).toString("base64url");
      } finally {
        Buffer.from(dataKey.plaintext).fill(0);
      }
    },

    async decrypt(token: string): Promise<string> {
      const envelope = JSON.parse(
        Buffer.from(token, "base64url").toString("utf8"),
      ) as EnvelopeV1;
      if (envelope.v !== 1) {
        throw new Error(`fieldCipher: unsupported envelope v${envelope.v}`);
      }
      const dataKey = await kms.decryptDataKey(
        Buffer.from(envelope.edk, "base64url"),
        envelope.kid,
      );
      try {
        const raw = Buffer.from(envelope.ct, "base64url");
        const tag = raw.subarray(raw.length - GCM_TAG_LEN);
        const body = raw.subarray(0, raw.length - GCM_TAG_LEN);
        const decipher = createDecipheriv(
          "aes-256-gcm",
          Buffer.from(dataKey),
          Buffer.from(envelope.iv, "base64url"),
        );
        decipher.setAuthTag(tag);
        return Buffer.concat([
          decipher.update(body),
          decipher.final(),
        ]).toString("utf8");
      } finally {
        Buffer.from(dataKey).fill(0);
      }
    },

    rotateTo(nextKeyId: string): void {
      currentKeyId = nextKeyId;
    },
  };
}

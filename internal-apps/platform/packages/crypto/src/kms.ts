import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/** A KMS-issued data key: plaintext for local use, ciphertext for storage in the envelope. */
export interface DataKey {
  plaintext: Uint8Array;
  ciphertext: Uint8Array;
}

/**
 * Envelope-encryption KMS provider. Implementations issue data keys and
 * unwrap them; the plaintext master key never leaves the provider.
 */
export interface KmsProvider {
  generateDataKey(keyId: string): Promise<DataKey>;
  decryptDataKey(ciphertext: Uint8Array, keyId: string): Promise<Uint8Array>;
}

/**
 * AWS KMS-backed provider. Takes a thin client so the AWS SDK stays an
 * app-side dependency — see README for the six-line adapter onto
 * `@aws-sdk/client-kms` (`KMSClient.send(GenerateDataKeyCommand | DecryptCommand)`).
 */
export interface AwsKmsClientLike {
  generateDataKey(input: {
    KeyId: string;
    KeySpec: "AES_256";
  }): Promise<{ Plaintext: Uint8Array; CiphertextBlob: Uint8Array }>;
  decrypt(input: {
    CiphertextBlob: Uint8Array;
    KeyId: string;
  }): Promise<{ Plaintext: Uint8Array }>;
}

export class AwsKmsProvider implements KmsProvider {
  constructor(private readonly client: AwsKmsClientLike) {}

  async generateDataKey(keyId: string): Promise<DataKey> {
    const r = await this.client.generateDataKey({
      KeyId: keyId,
      KeySpec: "AES_256",
    });
    return { plaintext: r.Plaintext, ciphertext: r.CiphertextBlob };
  }

  async decryptDataKey(
    ciphertext: Uint8Array,
    keyId: string,
  ): Promise<Uint8Array> {
    const r = await this.client.decrypt({
      CiphertextBlob: ciphertext,
      KeyId: keyId,
    });
    return r.Plaintext;
  }
}

const WRAP_IV_LEN = 12;
const GCM_TAG_LEN = 16;

/**
 * Deterministic, dependency-free KMS for tests and local dev.
 * Master keys are generated lazily or injected via the constructor;
 * ciphertext blobs are AES-256-GCM wraps of the data key under the master.
 */
export class InMemoryKMS implements KmsProvider {
  private readonly masters = new Map<string, Buffer>();

  constructor(keys: Record<string, Uint8Array> = {}) {
    for (const [keyId, key] of Object.entries(keys)) {
      this.masters.set(keyId, Buffer.from(key));
    }
  }

  /** Provision a master key. Rotation = create a new keyId; old keys stay decryptable. */
  addKey(keyId: string, key?: Uint8Array): void {
    this.masters.set(keyId, Buffer.from(key ?? randomBytes(32)));
  }

  async generateDataKey(keyId: string): Promise<DataKey> {
    const master = this.requireMaster(keyId);
    const dataKey = randomBytes(32);
    const iv = randomBytes(WRAP_IV_LEN);
    const wrap = createCipheriv("aes-256-gcm", master, iv);
    const body = Buffer.concat([wrap.update(dataKey), wrap.final()]);
    const ciphertext = Buffer.concat([iv, body, wrap.getAuthTag()]);
    return { plaintext: dataKey, ciphertext };
  }

  async decryptDataKey(
    ciphertext: Uint8Array,
    keyId: string,
  ): Promise<Uint8Array> {
    const master = this.requireMaster(keyId);
    const blob = Buffer.from(ciphertext);
    const iv = blob.subarray(0, WRAP_IV_LEN);
    const tag = blob.subarray(blob.length - GCM_TAG_LEN);
    const body = blob.subarray(WRAP_IV_LEN, blob.length - GCM_TAG_LEN);
    const unwrap = createDecipheriv("aes-256-gcm", master, iv);
    unwrap.setAuthTag(tag);
    return Buffer.concat([unwrap.update(body), unwrap.final()]);
  }

  private requireMaster(keyId: string): Buffer {
    const master = this.masters.get(keyId);
    if (!master) throw new Error(`InMemoryKMS: unknown keyId "${keyId}"`);
    return master;
  }
}

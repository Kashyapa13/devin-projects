# @company/crypto

AES-256-GCM field encryption with KMS envelope keys — the C4 primitive.

## API

- `fieldCipher(kms: KmsProvider, keyId: string): FieldCipher`
  - `encrypt(plaintext) → Promise<string>` — base64url envelope `{v,kid,edk,iv,ct}`
  - `decrypt(token) → Promise<string>` — GCM auth tag enforces integrity
  - `rotateTo(nextKeyId)` — new writes use `nextKeyId`; `kid` travels inside
    the envelope so old ciphertext stays decryptable with zero re-encryption
- `KmsProvider` — `{ generateDataKey(keyId), decryptDataKey(blob, keyId) }`
- `AwsKmsProvider(client)` — AWS-backed provider over an injected client
- `InMemoryKMS` — real AES-GCM wrapping for tests/local dev

## Usage

```ts
import { fieldCipher, AwsKmsProvider } from "@company/crypto";

// Wire the real SDK app-side (six lines — the SDK stays out of this package):
import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from "@aws-sdk/client-kms";
const aws = new KMSClient({});
const provider = new AwsKmsProvider({
  async generateDataKey({ KeyId, KeySpec }) {
    const r = await aws.send(new GenerateDataKeyCommand({ KeyId, KeySpec }));
    return { Plaintext: r.Plaintext!, CiphertextBlob: r.CiphertextBlob! };
  },
  async decrypt({ CiphertextBlob, KeyId }) {
    const r = await aws.send(new DecryptCommand({ CiphertextBlob, KeyId }));
    return { Plaintext: r.Plaintext! };
  },
});

const cipher = fieldCipher(provider, process.env.KMS_KEY_ARN!);
const stored = await cipher.encrypt(kycDocument);
cipher.rotateTo(process.env.KMS_KEY_ARN_NEXT!); // old rows still decrypt
```

Tests use `InMemoryKMS` — same AES-GCM semantics, no cloud calls.

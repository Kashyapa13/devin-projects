# Data classification

Canonical reference for the classes declared in `AGENTS.md` → "Data
classification".

| Class | Meaning | Handling |
| --- | --- | --- |
| C4 | Regulated PII (KYC names/docs) | App-layer AES-256-GCM + KMS envelope; never in logs/telemetry/prompts/non-prod; synthetic fixtures only |
| C3 | Commercial (transaction metadata, tokenized refs) | Plaintext ok, logged sparingly; never cardholder data — if a field looks like it, STOP and report |
| C2 | Internal config | Normal handling |
| C1 | Public | Docs/deps |

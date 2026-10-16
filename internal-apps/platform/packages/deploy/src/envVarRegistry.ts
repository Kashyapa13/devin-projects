export interface EnvVarSpec {
  /** UPPER_SNAKE name — the only thing code ever reads. */
  name: string;
  /** vault:<env>/<app> style reference — a pointer, never a value. */
  vaultRef: string;
  /** which environments the var exists in */
  envs: ("dev" | "staging" | "prod")[];
}

const NAME_RE = /^[A-Z][A-Z0-9_]*$/;
const VAULT_RE = /^vault:[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/;

/**
 * Env var registry — NAMES and vault REFERENCES only. Registering a
 * literal value is a schema violation by design: values live in the
 * vault (infra/ENVIRONMENTS.md), never in the repo.
 */
export function envVarRegistry(
  specs: readonly EnvVarSpec[],
): ReadonlyMap<string, EnvVarSpec> {
  const map = new Map<string, EnvVarSpec>();
  for (const spec of specs) {
    if (!NAME_RE.test(spec.name)) {
      throw new Error(`envVarRegistry: bad name "${spec.name}"`);
    }
    if (!VAULT_RE.test(spec.vaultRef)) {
      throw new Error(
        `envVarRegistry: "${spec.name}" has a non-vault ref — values are forbidden`,
      );
    }
    if (spec.envs.length === 0) {
      throw new Error(`envVarRegistry: "${spec.name}" has no envs`);
    }
    if (map.has(spec.name)) {
      throw new Error(`envVarRegistry: duplicate "${spec.name}"`);
    }
    map.set(spec.name, spec);
  }
  return map;
}

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Absolute path to the base Dockerfile (non-root, healthcheck). */
export const DOCKERFILE_BASE = join(PKG_DIR, "docker", "Dockerfile.base");
/** Absolute path to the blue/green deploy template. */
export const BLUEGREEN_TEMPLATE = join(PKG_DIR, "deploy", "bluegreen.yaml");
/** Absolute path to the migration-job template. */
export const MIGRATION_JOB_TEMPLATE = join(
  PKG_DIR,
  "deploy",
  "migration-job.yaml",
);

export {
  envVarRegistry,
  type EnvVarSpec,
} from "./envVarRegistry.js";

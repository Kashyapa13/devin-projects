import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

export interface PgHarness {
  /** postgres:// DSN for the disposable database (name = app). */
  dsn: string;
  dbName: string;
  container: StartedPostgreSqlContainer;
  stop: () => Promise<void>;
}

/**
 * Per-app disposable Postgres via Testcontainers — one container per
 * app, matching the per-app-DB law. Synthetic fixtures only (C4 rule).
 */
export async function pgHarness(
  app: string,
  image = "postgres:16-alpine",
): Promise<PgHarness> {
  const container = await new PostgreSqlContainer(image)
    .withDatabase(app)
    .withUsername(app)
    .withPassword(`${app}-dev`)
    .start();
  return {
    dsn: container.getConnectionUri(),
    dbName: app,
    container,
    stop: async () => {
      await container.stop();
    },
  };
}

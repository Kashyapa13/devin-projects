declare module "@fastify/otel" {
  import type { FastifyPluginAsync } from "fastify";
  export interface FastifyOtelConfig {
    recordExceptions?: boolean;
    ignorePaths?: Array<string | RegExp> | ((opts: { request: unknown }) => boolean);
    wrapRoutes?: boolean | string[];
    instrumentHandler?: boolean;
    instrumentHooks?: boolean | Record<string, boolean>;
  }
  export default class FastifyOtelInstrumentation {
    constructor(config?: FastifyOtelConfig);
    setTracerProvider(provider: unknown): void;
    plugin(): FastifyPluginAsync;
  }
}

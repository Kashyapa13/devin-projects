import type { FastifyRequest } from "fastify";

export interface RateLimitPreset {
  max: number;
  timeWindow: string;
  keyGenerator: (req: FastifyRequest) => string;
}

const byIp = (req: FastifyRequest): string => req.ip;
const byUser = (req: FastifyRequest): string =>
  (req as FastifyRequest & { user?: { sub?: string } }).user?.sub ?? req.ip;

/**
 * Rate-limit presets (constitution defaults):
 *   auth     5/min per IP   — credential endpoints
 *   mutation 60/min per user — writes
 *   read     300/min per user — reads
 * Feed to @fastify/rate-limit via route `config.rateLimit`.
 */
export const rateLimitPresets = {
  auth: { max: 5, timeWindow: "1 minute", keyGenerator: byIp },
  mutation: { max: 60, timeWindow: "1 minute", keyGenerator: byUser },
  read: { max: 300, timeWindow: "1 minute", keyGenerator: byUser },
} satisfies Record<string, RateLimitPreset>;

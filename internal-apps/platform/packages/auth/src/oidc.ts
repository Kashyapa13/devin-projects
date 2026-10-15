import {
  createLocalJWKSet,
  createRemoteJWKSet,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

export interface VerifyIdTokenOptions {
  /** Expected `iss` claim — e.g. env SSO_ISSUER. */
  issuer: string;
  /** Remote JWKS URL, a JSONWebKeySet object (tests/dev), or a getKey fn. */
  jwks: URL | string | JSONWebKeySet | JWTVerifyGetKey;
  /** Expected `aud` claim, when your IdP emits one. */
  audience?: string;
}

export type IdTokenVerifier = (token: string) => Promise<JWTPayload>;

/**
 * Verify an OIDC ID token: signature via JWKS, issuer + audience +
 * expiry checked by jose. Rejects are typed jose errors — map them to
 * ApiError("UNAUTHORIZED") at the route layer.
 */
export function verifyIdToken(
  opts: VerifyIdTokenOptions,
): IdTokenVerifier {
  const getKey: JWTVerifyGetKey =
    typeof opts.jwks === "function"
      ? opts.jwks
      : typeof opts.jwks === "string" || opts.jwks instanceof URL
        ? createRemoteJWKSet(new URL(opts.jwks))
        : createLocalJWKSet(opts.jwks);
  return async (token: string) => {
    const { payload } = await jwtVerify(token, getKey, {
      issuer: opts.issuer,
      ...(opts.audience !== undefined ? { audience: opts.audience } : {}),
    });
    return payload;
  };
}

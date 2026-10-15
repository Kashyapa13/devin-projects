# @company/auth

OIDC verification, 8h sessions, RBAC.

## API

- `verifyIdToken({issuer, jwks, audience?})` — returns a verifier fn;
  `jwks` accepts a URL (remote JWKS), a `JSONWebKeySet` (tests/dev), or a
  jose `JWTVerifyGetKey`. Validates signature, issuer, audience, expiry.
- `sessionPlugin` — Fastify plugin decorating `app.session`
  (`create(payload)` / `verify(token)`); HS256 JWT, **8h TTL** default.
- `requireRole(...roles)` — preHandler: 401 unauthenticated, 403 wrong
  role. Server-side only.
- `rolesMatrix` — role→permission data (`admin`, `operator`, `analyst`,
  `viewer`); `hasPermission(user, perm)` / `permissionsOf(user)`.
- `bearerAuth(verify)` — preHandler that verifies `Authorization: Bearer`
  and sets `req.user = {sub, roles, ...claims}`.

## Usage

```ts
const verify = verifyIdToken({ issuer: env.SSO_ISSUER, jwks: env.SSO_JWKS_URL });
app.register(sessionPlugin, { secret: env.SESSION_SECRET });
app.get("/cases", { preHandler: [bearerAuth(verify), requireRole("operator")] }, handler);
```

Tests run against a local JWKS (`createLocalJWKSet`) — no IdP needed.

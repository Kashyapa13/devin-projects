# Mirrors platform/packages/deploy/docker/Dockerfile.base — multi-stage,
# non-root, healthcheck. Build from the repo root:
#   docker build --build-arg APP_DIR=apps_<name> -f apps/<app>/Dockerfile -t <app>:<tag> .

# ---- build ----
FROM node:22-slim AS build
WORKDIR /app
ENV NODE_ENV=production
ARG PKG_NAME=@app/flags
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile --prod=false \
 && pnpm --filter "${PKG_NAME}..." build \
 && pnpm --filter "${PKG_NAME}" --prod deploy /prod-app

# ---- runtime ----
# Prod deps only (deploy prunes devDeps — no turbo binary, no test tooling
# in the shipped image) + apt upgrade for base-image CVEs. Trivy gates on
# HIGH/CRITICAL; dev-only findings never reach this stage.
FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
 && groupadd -r app && useradd -r -g app app
COPY --from=build --chown=app:app /prod-app /app
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/api/src/server.js"]

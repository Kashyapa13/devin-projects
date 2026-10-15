# Mirrors platform/packages/deploy/docker/Dockerfile.base — multi-stage,
# non-root, healthcheck. Build from the repo root:
#   docker build --build-arg APP_DIR=refundlens -f apps/refundlens/Dockerfile -t refundlens:<tag> .

# ---- build ----
ARG NODE_IMAGE=node:22-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NODE_ENV=production
ARG PKG_NAME=@app/refundlens
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile --prod=false \
 && pnpm --filter "${PKG_NAME}..." build \
 && pnpm deploy --filter "${PKG_NAME}" --prod /prod/app

# ---- runtime ----
FROM ${NODE_IMAGE} AS runtime
ARG APP_DIR=refundlens
ENV NODE_ENV=production \
    APP_DIR=${APP_DIR} \
    PORT=8080
WORKDIR /app
RUN groupadd -r app && useradd -r -g app app
COPY --from=build --chown=app:app /prod/app /app
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD node apps/${APP_DIR}/dist/api/src/server.js

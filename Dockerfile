# syntax=docker/dockerfile:1

# ---- Build stage: install all deps, compile TypeScript, drop dev deps ----
FROM node:22-slim AS build
WORKDIR /app

# Toolchain for compiling better-sqlite3 when no prebuilt binary matches.
# Only in this stage; the runtime image stays slim.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- Runtime stage: same base image so the native better-sqlite3 build matches ----
FROM node:22-slim
WORKDIR /app

ENV NODE_ENV=production \
    DATA_DIR=/data \
    FIXTURES_DIR=/app/fixtures \
    PUBLIC_DIR=/app/public \
    PORT=8080

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY fixtures ./fixtures
COPY public ./public

RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:' + (process.env.PORT || 8080) + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "dist/server.js"]

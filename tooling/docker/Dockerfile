# syntax=docker/dockerfile:1

# =============================================================================
# Durabull Production Dockerfile
# Uses turbo prune for optimal monorepo Docker builds
# =============================================================================

FROM oven/bun:1.3.5 AS base
WORKDIR /app

# -----------------------------------------------------------------------------
# Prune: Create minimal monorepo with api + web
# -----------------------------------------------------------------------------
FROM base AS prune
RUN bun add -g turbo
COPY . .
RUN turbo prune @durabull/api @durabull/web @durabull/scripts --docker

# -----------------------------------------------------------------------------
# Deps: Install all dependencies (for building)
# -----------------------------------------------------------------------------
FROM base AS deps
COPY --from=prune /app/out/json/ .
RUN bun install --no-save --ignore-scripts

# -----------------------------------------------------------------------------
# Prod-deps: Production dependencies only (for release)
# -----------------------------------------------------------------------------
FROM base AS prod-deps
COPY --from=prune /app/out/json/ .
RUN bun install --omit=dev --no-save --ignore-scripts

# -----------------------------------------------------------------------------
# Build: Build the web app
# -----------------------------------------------------------------------------
FROM deps AS build
ARG DURABULL_APP_VERSION
ARG DURABULL_BUILD_ID
ARG DURABULL_BUILD_TIME
ARG DURABULL_RELEASE_CHANNEL=stable
ENV DURABULL_APP_VERSION=$DURABULL_APP_VERSION
ENV DURABULL_BUILD_ID=$DURABULL_BUILD_ID
ENV DURABULL_BUILD_TIME=$DURABULL_BUILD_TIME
ENV DURABULL_RELEASE_CHANNEL=$DURABULL_RELEASE_CHANNEL
COPY --from=prune /app/out/full/ .
# Run vite build directly (skip tsc typecheck - it runs in CI separately)
RUN cd apps/web && bun x vite build

# -----------------------------------------------------------------------------
# Release: Minimal production image
# -----------------------------------------------------------------------------
FROM base AS release
LABEL org.opencontainers.image.licenses="Apache-2.0"

ARG DURABULL_APP_VERSION
ARG DURABULL_BUILD_ID
ARG DURABULL_BUILD_TIME
ARG DURABULL_RELEASE_CHANNEL=stable
ENV NODE_ENV=production
ENV PORT=3000
ENV DURABULL_APP_VERSION=$DURABULL_APP_VERSION
ENV DURABULL_BUILD_ID=$DURABULL_BUILD_ID
ENV DURABULL_BUILD_TIME=$DURABULL_BUILD_TIME
ENV DURABULL_RELEASE_CHANNEL=$DURABULL_RELEASE_CHANNEL

# Production deps only (smaller image)
COPY --from=prod-deps /app/node_modules ./node_modules

# Root config files (from prune stage since they're not in out/full)
COPY --from=prune /app/package.json ./
COPY --from=prune /app/tsconfig.json ./
COPY --from=prune /app/LICENSE /app/NOTICE ./

# API and workspace packages
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages ./packages
COPY --from=build /app/tooling ./tooling

# Built web app
COPY --from=build /app/apps/web/dist ./apps/web/dist

RUN mkdir -p /app/data && chown -R bun:bun /app/data

USER bun
EXPOSE 3000/tcp
ENTRYPOINT ["bun", "run", "apps/api/src/index.ts"]

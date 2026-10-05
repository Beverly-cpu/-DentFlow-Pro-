FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @dentflow/api...
COPY apps/api apps/api
RUN pnpm --filter @dentflow/api build && pnpm deploy --filter @dentflow/api --prod /runtime

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
WORKDIR /app
RUN groupadd --system dentflow && useradd --system --gid dentflow --home-dir /app dentflow
COPY --from=build --chown=dentflow:dentflow /runtime ./
COPY --from=build --chown=dentflow:dentflow /app/apps/api/dist ./dist
USER dentflow
EXPOSE 8787
CMD ["node","dist/index.js"]

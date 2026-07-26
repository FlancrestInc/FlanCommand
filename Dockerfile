FROM node:22.14.0-alpine3.21@sha256:9bef0ef1e268f60627da9ba7d7605e8831d5b56ad07487d24d1aa386336d1944

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY probe ./probe
COPY docs ./docs
COPY hermes-command-center-roadmap.md README.md CONTRIBUTING.md tsconfig.base.json vitest.config.ts eslint.config.mjs .prettierrc.json .prettierignore ./

RUN corepack enable && corepack prepare pnpm@10.12.1 --activate \
  && pnpm install --frozen-lockfile --config.node-linker=hoisted \
  && pnpm build \
  && mkdir -p /workspace/node_modules/@flancommand \
  && ln -s /workspace/packages/config /workspace/node_modules/@flancommand/config \
  && ln -s /workspace/packages/event-schema /workspace/node_modules/@flancommand/event-schema \
  && ln -s /workspace/packages/hermes-adapter /workspace/node_modules/@flancommand/hermes-adapter \
  && mkdir -p /workspace/storage \
  && chown -R node:node /workspace

USER node

ENV FLANC_COMMAND_START=1 \
    FLANC_COMMAND_HOST=0.0.0.0 \
    PORT=3000 \
    FLANC_STORAGE_ROOT=/workspace/storage

EXPOSE 3000

CMD ["node", "dist/apps/api/src/index.js"]

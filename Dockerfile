FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS deps
WORKDIR /app
ENV CI=true
RUN apk add --no-cache python3 py3-pip make g++ \
  && npm install --global corepack@0.35.0 \
  && corepack enable \
  && corepack install --global pnpm@10.28.1 \
  && python3 -m venv /opt/opentimestamps \
  && /opt/opentimestamps/bin/pip install --no-cache-dir opentimestamps-client==0.7.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS builder
WORKDIR /app
ARG SITE_URL
ENV SITE_URL=$SITE_URL
ENV CI=true
RUN npm install --global corepack@0.35.0 \
  && corepack enable \
  && corepack install --global pnpm@10.28.1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS runner
WORKDIR /app
ARG GIT_COMMIT_SHA=development
ENV CI=true
ENV NODE_ENV=production
ENV OTS_CLI_PATH=/opt/opentimestamps/bin/ots
ENV BUILD_COMMIT_SHA=$GIT_COMMIT_SHA
LABEL org.opencontainers.image.revision=$GIT_COMMIT_SHA
LABEL org.opencontainers.image.source="https://github.com/arthurlee116/arthurs-review-main"
RUN apk add --no-cache python3 make g++ \
  && npm install --global corepack@0.35.0 \
  && corepack enable \
  && corepack install --global pnpm@10.28.1
ENV COREPACK_ENABLE_NETWORK=0
COPY --from=deps /opt/opentimestamps /opt/opentimestamps
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
EXPOSE 3000
CMD ["pnpm", "start"]

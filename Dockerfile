FROM node:24-alpine AS deps
WORKDIR /app
ENV CI=true
RUN apk add --no-cache python3 py3-pip make g++ && corepack enable \
  && python3 -m venv /opt/opentimestamps \
  && /opt/opentimestamps/bin/pip install --no-cache-dir opentimestamps-client==0.7.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-alpine AS builder
WORKDIR /app
ENV CI=true
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:24-alpine AS runner
WORKDIR /app
ENV CI=true
ENV NODE_ENV=production
ENV OTS_CLI_PATH=/opt/opentimestamps/bin/ots
RUN apk add --no-cache python3 make g++ && corepack enable
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
CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]

# The libvips build, runtime libraries, pnpm and the OpenTimestamps CLI live in
# docker/base.Dockerfile, published under a content-hash tag (scripts/image-tags.sh).
# This file only installs dependencies and builds the app, ordered so the layers
# production has to pull change as rarely as possible.
ARG BASE_IMAGE=ghcr.io/arthurlee116/arthurs-review-main
ARG BASE_TAG

FROM ${BASE_IMAGE}:base-build-${BASE_TAG} AS deps
WORKDIR /app
ENV CI=true
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Production-only node_modules depend on the lockfile alone, so this layer keeps
# the same digest across ordinary code changes and the VPS skips pulling it.
FROM ${BASE_IMAGE}:base-build-${BASE_TAG} AS prod-deps
WORKDIR /app
ENV CI=true
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
# Point sharp at the HEVC-capable libvips from the base image. sharp's .node
# addon NEEDs libvips-cpp.so.<vendored version> from its sibling @img package
# (RUNPATH=$ORIGIN), so overwrite that exact file — whatever version sharp ships —
# with our build. @img packages are pnpm symlinks: write through, never delete.
# (sharp.versions is a static versions.json, so check the mapped library instead:
# only our wrapper links /usr/lib/libvips.so.42; the vendored one is self-contained.)
RUN set -e; \
  VENDORED=$(find /app/node_modules/.pnpm -type d -path '*@img+sharp-libvips-linuxmusl-*/lib' | head -1); \
  test -n "$VENDORED" || { echo "vendored sharp-libvips lib dir not found" >&2; exit 1; }; \
  WRAPPER=$(find "$VENDORED" -maxdepth 1 -name 'libvips-cpp.so.*' | head -1); \
  test -n "$WRAPPER" || { echo "vendored libvips-cpp not found" >&2; exit 1; }; \
  cp "$(readlink -f /usr/lib/libvips-cpp.so.42)" "$WRAPPER"; \
  node -e 'require("sharp"); if (!require("fs").readFileSync("/proc/self/maps", "utf8").includes("/usr/lib/libvips.so.42")) { console.error("sharp loads its vendored libvips, not the HEVC-capable build"); process.exit(1) }'

FROM deps AS builder
ARG SITE_URL
ENV SITE_URL=$SITE_URL
ARG NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN=""
ENV NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN=$NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN
COPY . .
# .next/cache is build-time scratch; shipping it would add a fresh layer to every deploy.
RUN pnpm build && rm -rf .next/cache

FROM ${BASE_IMAGE}:base-runtime-${BASE_TAG} AS runner
WORKDIR /app
ENV CI=true
ENV NODE_ENV=production
ENV OTS_CLI_PATH=/opt/opentimestamps/bin/ots
ENV COREPACK_ENABLE_NETWORK=0
# Least volatile first: dependencies, then config/assets, then source, then the build.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml next.config.ts tsconfig.json ./
COPY public ./public
COPY scripts ./scripts
COPY src ./src
COPY --from=builder /app/.next ./.next
ARG GIT_COMMIT_SHA=development
ENV BUILD_COMMIT_SHA=$GIT_COMMIT_SHA
LABEL org.opencontainers.image.revision=$GIT_COMMIT_SHA
LABEL org.opencontainers.image.source="https://github.com/arthurlee116/arthurs-review-main"
EXPOSE 3000
CMD ["pnpm", "start"]

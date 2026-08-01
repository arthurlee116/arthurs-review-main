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

# sharp's prebuilt libvips 8.18.3 rejects iPhone HEIC (Live Photo / portrait / burst)
# with >16 iref references ("Security limit exceeded"). libvips 8.18.4 raises that
# limit, but no sharp release bundles it yet, so build 8.18.4 from source and swap
# it in below. Remove this stage (and the COPY lines in runner) once @img/sharp-libvips-*
# ships 8.18.4+.
FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS libvips
WORKDIR /build
ENV VIPS_VERSION=8.18.4
RUN apk add --no-cache \
      glib libjpeg-turbo libpng libwebp cgif libexif lcms2 fftw tiff highway expat \
      build-base meson ninja pkgconf wget \
      glib-dev libjpeg-turbo-dev libpng-dev libwebp-dev cgif-dev libexif-dev \
      lcms2-dev fftw-dev tiff-dev highway-dev expat-dev \
  && apk add --no-cache \
      --repository=https://dl-cdn.alpinelinux.org/alpine/edge/community \
      libheif libheif-dev \
  && wget -q -O- "https://github.com/libvips/libvips/releases/download/v${VIPS_VERSION}/vips-${VIPS_VERSION}.tar.xz" | tar xJ \
  && meson setup /build/out "/build/vips-${VIPS_VERSION}" \
      --prefix /usr --buildtype release \
      -Ddeprecated=false -Dexamples=false -Dcplusplus=false -Ddocs=false \
      -Dmodules=disabled -Dintrospection=disabled -Dvapi=false \
      -Dcfitsio=disabled -Dcgif=enabled -Dexif=enabled -Dfftw=enabled \
      -Dfontconfig=disabled -Darchive=disabled -Dheif=enabled -Dheif-module=disabled \
      -Dimagequant=disabled -Djpeg=enabled -Djpeg-xl=disabled -Djpeg-xl-module=disabled \
      -Dlcms=enabled -Dmagick=disabled -Dmatio=disabled -Dnifti=disabled \
      -Dopenexr=disabled -Dopenjpeg=disabled -Dopenslide=disabled -Dorc=disabled \
      -Dpangocairo=disabled -Dpdfium=disabled -Dpng=enabled -Dpoppler=disabled \
      -Dpoppler-module=disabled -Dquantizr=disabled -Drsvg=disabled -Dspng=disabled \
      -Dtiff=enabled -Dwebp=enabled -Dzlib=enabled \
      -Dnsgif=false -Dppm=false -Danalyze=false -Dradiance=false \
  && meson compile -C /build/out \
  && meson install -C /build/out --strip

FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS runner
WORKDIR /app
ARG GIT_COMMIT_SHA=development
ENV CI=true
ENV NODE_ENV=production
ENV OTS_CLI_PATH=/opt/opentimestamps/bin/ots
ENV BUILD_COMMIT_SHA=$GIT_COMMIT_SHA
LABEL org.opencontainers.image.revision=$GIT_COMMIT_SHA
LABEL org.opencontainers.image.source="https://github.com/arthurlee116/arthurs-review-main"
RUN apk add --no-cache python3 make g++ ffmpeg \
      glib libjpeg-turbo libpng libwebp cgif libexif lcms2 fftw tiff highway expat \
  && apk add --no-cache \
      --repository=https://dl-cdn.alpinelinux.org/alpine/edge/community \
      libheif \
  && npm install --global corepack@0.35.0 \
  && corepack enable \
  && corepack install --global pnpm@10.28.1
ENV COREPACK_ENABLE_NETWORK=0
COPY --from=deps /opt/opentimestamps /opt/opentimestamps
COPY --from=libvips /usr/lib/libvips.so.42* /usr/lib/
COPY --from=libvips /usr/bin/vips* /usr/bin/
COPY --from=libvips /usr/lib/pkgconfig/vips*.pc /usr/lib/pkgconfig/
COPY --from=libvips /usr/include/vips /usr/include/vips
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
# Point sharp's vendored libvips at the 8.18.4 build from the libvips stage.
# @img packages live under pnpm's virtual store, so resolve them at build time.
RUN set -e; \
  VENDORED=$(find /app/node_modules/.pnpm -type d -path '*@img+sharp-libvips-linuxmusl-x64*/lib' | head -1); \
  test -n "$VENDORED" || { echo "vendored sharp-libvips lib dir not found" >&2; exit 1; }; \
  rm -f "$VENDORED"/libvips-cpp.so.42*; \
  cp -d /usr/lib/libvips.so.42* "$VENDORED"/; \
  ln -sf libvips.so.42 "$VENDORED/libvips-cpp.so.42"
EXPOSE 3000
CMD ["pnpm", "start"]

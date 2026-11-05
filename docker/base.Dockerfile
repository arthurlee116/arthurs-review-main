# Slow-changing foundation for the app image. Published to GHCR as
#   ghcr.io/<repo>:base-runtime-<hash>  (what production runs on)
#   ghcr.io/<repo>:base-build-<hash>    (runtime + compilers for pnpm install)
# where <hash> is derived from this file's contents (see scripts/image-tags.sh),
# so CI only rebuilds it when this file changes. Never edit a published tag.

# sharp's prebuilt libvips can never decode iPhone HEIC: HEVC is patent-encumbered,
# so lovell/sharp-libvips only bundles royalty-free decoders (aom/AV1 → AVIF only).
# This holds for sharp 0.35.5 / sharp-libvips 1.3.4 (libvips 8.18.7, libheif 1.23.5
# without libde265). We therefore build libvips against Alpine edge's libheif, which
# links libde265 + dav1d, and swap it into sharp's vendored directory in the app
# image. The rsvg loader stays enabled: next/og rasterizes its SVG through sharp,
# and without rsvg every OG render fails with "unsupported image format".
FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS libvips
WORKDIR /build
ENV VIPS_VERSION=8.18.4
# Checksum-pinned source; ADD lets BuildKit fetch it (and retry) outside the RUN.
ADD --checksum=sha256:2677bad6c422617fd1172d359c16af34e736965d042c214203a87187d26ff037 \
    https://github.com/libvips/libvips/releases/download/v8.18.4/vips-8.18.4.tar.xz /build/vips.tar.xz
RUN apk add --no-cache \
      glib libjpeg-turbo libpng libwebp libwebpmux libwebpdemux cgif libexif lcms2 fftw tiff highway expat librsvg \
      build-base meson ninja pkgconf \
      glib-dev libjpeg-turbo-dev libpng-dev libwebp-dev cgif-dev libexif-dev \
      lcms2-dev fftw-dev tiff-dev highway-dev expat-dev librsvg-dev \
  && apk add --no-cache \
      --repository=https://dl-cdn.alpinelinux.org/alpine/edge/community \
      libheif libheif-dev \
  && tar xJf /build/vips.tar.xz -C /build \
  && meson setup /build/out "/build/vips-${VIPS_VERSION}" \
      --prefix /usr --buildtype release \
      -Ddeprecated=false -Dexamples=false -Dcplusplus=true -Ddocs=false \
      -Dmodules=disabled -Dintrospection=disabled -Dvapi=false \
      -Dcfitsio=disabled -Dcgif=enabled -Dexif=enabled -Dfftw=enabled \
      -Dfontconfig=disabled -Darchive=disabled -Dheif=enabled -Dheif-module=disabled \
      -Dimagequant=disabled -Djpeg=enabled -Djpeg-xl=disabled -Djpeg-xl-module=disabled \
      -Dlcms=enabled -Dmagick=disabled -Dmatio=disabled -Dnifti=disabled \
      -Dopenexr=disabled -Dopenjpeg=disabled -Dopenslide=disabled -Dorc=disabled \
      -Dpangocairo=disabled -Dpdfium=disabled -Dpng=enabled -Dpoppler=disabled \
      -Dpoppler-module=disabled -Dquantizr=disabled -Drsvg=enabled -Dspng=disabled \
      -Dtiff=enabled -Dwebp=enabled -Dzlib=enabled \
      -Dnsgif=false -Dppm=false -Danalyze=false -Dradiance=false \
  && meson compile -C /build/out \
  && meson install -C /build/out --strip

# OpenTimestamps CLI in its own venv; only python3 is needed to run it later.
FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS ots
RUN apk add --no-cache python3 py3-pip make g++ \
  && python3 -m venv /opt/opentimestamps \
  && /opt/opentimestamps/bin/pip install --no-cache-dir opentimestamps-client==0.7.2

FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS runtime
# No compilers here: native modules are built in the `build` target and copied in.
RUN apk add --no-cache python3 ffmpeg \
      glib libjpeg-turbo libpng libwebp libwebpmux libwebpdemux cgif libexif lcms2 fftw tiff highway expat librsvg \
  && apk add --no-cache \
      --repository=https://dl-cdn.alpinelinux.org/alpine/edge/community \
      libheif \
  && npm install --global corepack@0.35.0 \
  && corepack enable \
  && corepack install --global pnpm@10.28.1
COPY --from=ots /opt/opentimestamps /opt/opentimestamps
COPY --from=libvips /usr/lib/libvips.so.42* /usr/lib/
COPY --from=libvips /usr/lib/libvips-cpp.so.42* /usr/lib/
COPY --from=libvips /usr/bin/vips* /usr/bin/

FROM runtime AS build
RUN apk add --no-cache make g++

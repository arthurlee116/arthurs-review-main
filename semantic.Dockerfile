FROM python:3.12.13-slim-bookworm@sha256:d50fb7611f86d04a3b0471b46d7557818d88983fc3136726336b2a4c657aa30b

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV OMP_NUM_THREADS=1
ENV OMP_WAIT_POLICY=PASSIVE
ENV MALLOC_ARENA_MAX=1
ENV MALLOC_TRIM_THRESHOLD_=131072

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates libgomp1 \
  && rm -rf /var/lib/apt/lists/*

ARG MODEL_LOCK=semantic/models.lock.json
COPY ${MODEL_LOCK} ./models.lock.json
COPY semantic/download_models.py ./download_models.py
COPY semantic/semantic_service/__init__.py semantic/semantic_service/artifacts.py ./semantic_service/
RUN python download_models.py --lock /app/models.lock.json --destination /models

COPY semantic/pyproject.toml ./pyproject.toml
COPY semantic/semantic_service ./semantic_service
RUN pip install --no-cache-dir .

RUN useradd --create-home --uid 10001 semantic
ARG GIT_COMMIT_SHA=development
LABEL org.opencontainers.image.revision=$GIT_COMMIT_SHA
LABEL org.opencontainers.image.source="https://github.com/arthurlee116/arthurs-review-main"
USER semantic

EXPOSE 8090
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=3 \
  CMD ["python", "-c", "import json,urllib.request; assert json.load(urllib.request.urlopen('http://127.0.0.1:8090/healthz', timeout=3))['ok']"]
CMD ["python", "-m", "semantic_service.server", "--lock", "/app/models.lock.json", "--models", "/models", "--host", "0.0.0.0", "--port", "8090"]

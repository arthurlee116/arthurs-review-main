# Publication Proof Automation

## Goal

Create independent, versioned evidence whenever an article is first published or an already-published article is changed. A proof establishes that the captured content existed no later than the recorded third-party timestamp; it does not claim when the author began writing it.

## Triggering

- First publication creates a proof.
- Updating an article that is already published creates a proof when its content changed.
- Draft creation and draft edits do not create proofs.
- Re-saving identical published content does not create a duplicate proof.
- Unpublishing does not delete prior proofs.

## Evidence

Each proof version preserves:

- a canonical UTF-8 document containing the public URL and article content at that revision;
- its SHA-256 digest;
- an OpenTimestamps `.ots` receipt generated with `@opentimestamps/typescript-opentimestamps`;
- the Internet Archive Save Page Now capture URL;
- creation time and independent status/error fields for both services.

Proof files live under `DATA_DIR` and proof metadata lives in SQLite. Existing versions are immutable. A slug or category change creates evidence for the new public URL without altering evidence for the old URL.

## Processing

The authenticated article route performs the database mutation, invalidates public content caches, and schedules proof creation with Next.js `after()`. The HTTP response does not wait for third-party services.

The background operation writes the canonical document first, then submits the digest to OpenTimestamps and the refreshed public URL to Save Page Now. Transient requests use bounded retries and timeouts. Failure of either service is recorded but never rolls back or blocks the article mutation. A later article mutation may retry unresolved work; no general-purpose queue or worker service is introduced.

Internet Archive credentials are read only from `WAYBACK_ACCESS_KEY` and `WAYBACK_SECRET_KEY`. OpenTimestamps uses free public calendars and needs no credentials.

## Public UI

Published article pages end with a native `<details>` disclosure.

- Collapsed: a small, muted English label, `Proof of Publication`, with the browser's disclosure triangle.
- Expanded: proof versions newest first, each showing the Wayback snapshot link, SHA-256 digest, and `.ots` download.
- Pending or failed service details remain visible only in Studio; incomplete public records show only evidence that actually exists.

Native `<details>` supplies keyboard interaction and accessibility without client-side JavaScript.

## Downloads and Safety

Public download routes resolve proof IDs through the database and serve only the recorded canonical document or `.ots` file from the proof directory. Callers cannot provide filesystem paths. Responses use attachment headers and conservative content types.

Secrets are documented in `deploy/production.env.example` but never committed with values. Deployment continues to source the real values from the existing GitHub `PRODUCTION_ENV` secret.

## Verification

Tests cover trigger rules, duplicate suppression, deterministic hashing, partial third-party failure, safe proof downloads, and collapsed/expanded article markup. Verification includes the focused tests, the complete test suite, type checking, linting, and a production build. Live verification uses a real published page only after fresh Internet Archive credentials are installed.

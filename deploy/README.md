# Production network topology

The production edge deliberately keeps HAProxy because one public TLS port serves both the blog and Xray.

```text
Internet :80  -> HAProxy -> 308 HTTPS redirect
Internet :443 -> HAProxy TCP/SNI
  blog.leesaitool.com        -> Caddy 127.0.0.1:8444 -> app:3000
  studio.blog.leesaitool.com -> Caddy 127.0.0.1:8444 -> app:3000
  www.bing.com / default     -> Xray 127.0.0.1:9443
Internet :2443 -> xray-test.service directly
```

HAProxy sends PROXY v2 only to Caddy. Caddy accepts it solely through its loopback-published port and overwrites upstream client-IP headers from the resulting peer address. The Xray backends do not receive PROXY protocol.

The current VPS runs CentOS Stream 9. `scripts/server-bootstrap.sh` supports that production OS as well as Debian and Ubuntu, installs Docker from Docker's official repository, and selects `crond` or `cron` accordingly. On CentOS it adds the public port rules only when `firewalld` is already active; otherwise the provider firewall must allow SSH plus TCP 80, 443, and 2443.

`xray-test.service`, `xray-443.service`, their configs, certificates, protocols, firewall rules, and ports are external production assets. Deployments hash and verify them before and after but never stop, restart, enable, disable, rewrite, or repair them.

The canonical HAProxy configuration is `deploy/haproxy.cfg`; `scripts/install-haproxy-config.sh` validates, reloads, health-checks, and restores the previous file on failure. `scripts/production-topology-preflight.sh` is the read-only topology and Xray-integrity gate.

## Studio mTLS

`https://studio.blog.leesaitool.com` requires a client certificate signed by `deploy/studio-client-ca.pem` before Caddy forwards any HTTP request. The public host returns `404` for both `/studio` and `/studio/*`, so the password form is not exposed there.

The committed PEM contains only the public CA certificate. The CA private key and the `Arthur Blog Studio Mac` client private key live only in Arthur's Login Keychain, are marked non-extractable, and must never be copied to the VPS, the repository, GitHub Secrets, or a backup archive. Caddy receives only the public CA through a read-only bind mount.

The client certificate is valid for 825 days. Rotate before expiry by creating a new CA and client identity on the Mac, replacing the public PEM, deploying it, verifying the new identity, and only then deleting the old Keychain identities. If the Mac is lost or compromised, replace the entire CA and client pair; no server-side private material needs recovery.

## Immutable releases and rollback

CI builds the application image once, runs Playwright against that image, pushes it, and resolves its `sha256:` digest. `scripts/deploy.sh` stages only `deploy/` and `scripts/`; the VPS never receives application source and never builds the app. Both app and worker use the same `APP_IMAGE` digest from `deploy/.env`.

`scripts/remote-release.sh` holds `/var/lock/arthurs-review-maintenance.lock` for the whole transaction. It pulls with the job-scoped registry token from stdin, logs out immediately, checks the OCI revision label, snapshots SQLite and the active configuration, runs migrations exactly once, then verifies internal and public `/healthz` and exact `/version` metadata before starting the worker.

Release metadata is root-only under `/var/lib/arthurs-review`:

- `current-release.env` identifies the running immutable image.
- `previous-release.env` identifies the only release eligible for manual rollback and points to its database/configuration snapshots.
- `.github/workflows/rollback.yml` refuses arbitrary image input and restores only that recorded previous release.

The first immutable deployment can automatically restore the pre-existing legacy app/config/database if it fails, but it deliberately does not expose that moving local image as a manual rollback target. `previous-release.env` becomes available after the next successful immutable deployment.

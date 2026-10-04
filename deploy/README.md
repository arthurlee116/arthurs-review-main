# Production network topology

The production edge deliberately keeps HAProxy because one public TLS port serves both the blog and Xray.

```text
Internet :80  -> HAProxy -> 308 HTTPS redirect
Internet :443 -> HAProxy TCP/SNI
  blog.leesaitool.com        -> Caddy 127.0.0.1:8444 -> app:3000
  studio.blog.leesaitool.com -> Caddy 127.0.0.1:8444 -> app:3000
  www.bing.com / default     -> Xray 127.0.0.1:9443
Internet :443/udp -> hysteria-final
Internet :8443/udp -> Caddy QUIC :443 -> app:3000 (HTTP/3)
```

HAProxy sends PROXY v2 only to Caddy. Caddy accepts it solely through its loopback-published port and overwrites upstream client-IP headers from the resulting peer address. The Xray backends do not receive PROXY protocol.

HTTP/3 reaches Caddy directly over public UDP 8443; TCP 443 still goes through HAProxy. Compose publishes `8443:443/udp`, and both HTTPS sites override Caddy's automatic advertisement with `Alt-Svc: h3=":8443"; ma=86400`. UDP 443 belongs to Hysteria, so advertising that port would send browsers to the wrong service. The same site routes, client-IP header replacement, and Studio client-certificate policy apply to QUIC. Bootstrap opens UDP 8443 in UFW or active firewalld; any provider firewall must allow it too. A port mapping change requires recreating only the Caddy service (`up -d --no-deps caddy`), since a config reload cannot change container port publication.

Verify discovery with `curl -sSI https://blog.leesaitool.com/healthz`. With an HTTP/3-capable curl, verify the UDP path without TCP fallback using `curl --noproxy '*' --http3-only --connect-to blog.leesaitool.com:443:blog.leesaitool.com:8443 -w '\nHTTP %{http_version}\n' https://blog.leesaitool.com/healthz`; expect HTTP 3 and a healthy response. The URL retains the original authority while the QUIC connection uses the advertised alternative port. Also verify `/studio` still returns 404 on the public host and the Studio hostname still rejects clients without a certificate over QUIC.

The current VPS runs Ubuntu 26.04 LTS. `scripts/server-bootstrap.sh` also supports Debian and CentOS Stream 9, installs Docker from Docker's official repository, and selects `crond` or `cron` accordingly. On CentOS it adds the public port rules only when `firewalld` is already active; otherwise the provider firewall must allow SSH, TCP 80 and 443, and UDP 8443.

HAProxy is installed as the `haproxy` Debian package from Vincent Bernat's `haproxy-3.4` PPA for Ubuntu `resolute` (3.4.6 as of 2026-10-04). The repository key is `/etc/apt/keyrings/haproxy-3.4.asc`, fingerprint `3D653970FBAB0A890E4E4E9A0F14D8B0CF4EFE96`; the source is `/etc/apt/sources.list.d/haproxy-3.4.sources`. `/etc/apt/preferences.d/haproxy-34` restricts that PPA to the HAProxy package. Routine updates can use `apt-get install --only-upgrade haproxy`; do not run a host-wide upgrade as part of blog maintenance.

Caddy runs 2.11.7 from the official GitHub release. Its official container tag was not yet published on 2026-10-04, so Compose pins the 2.11.6 Alpine image by digest and mounts the verified 2.11.7 binary read-only over `/usr/bin/caddy`. Before first deployment on a new VPS, run `bash scripts/install-caddy-binary.sh` as root. The installer pins the archive SHA-256, checks the executable version, and refuses to overwrite a differing installed binary. `/opt/arthurs-review-runtime/caddy/2.11.7/caddy` lives outside the release directories so deployment staging cannot delete it; Compose refuses to start if it is missing. Once the official 2.11.7 image is available, pin its digest and remove the binary mount and installer.

`xray-443.service`, its config, certificates, protocol, firewall rules, and port are external production assets. Deployments hash and verify them before and after but never stop, restart, enable, disable, rewrite, or repair them.

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

## 语义搜索 sidecar

语义搜索使用单个内网 ONNX sidecar。默认 embedding 是 `ibm-granite/granite-embedding-97m-multilingual-r2`（Apache-2.0，384 维，固定 revision），与 app 一样必须用 GHCR immutable digest 部署；sidecar 没有宿主机端口，也不允许运行期下载模型。模型 artifact、revision 和 SHA-256 在 `semantic/models.lock.json` 固定。

默认 `SEMANTIC_RERANK_ENABLED=1`。冻结配置后的 held-out benchmark 中，mMARCO 将 MRR@10 从 0.8272 提到 0.8557（+0.0285），Hit@10 保持 0.9877，单核 p95 为 4.78 秒，因此通过预设门槛。紧急内存止血时可设为 `0`；此时 sidecar 不加载 reranker，查询保留 RRF 顺序。

发布与翻译会在同一 SQLite 事务写入 durable `search.embed` job，worker 成功推理后才原子替换对应 revision 的向量。首次部署或模型 revision 变化后执行：

```bash
rtk docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec worker pnpm search:backfill
```

可用 `--force` 重建当前所有 published revisions。向量只是派生数据，数据库和 Markdown 仍是事实来源；不要把 backfill 当备份。

健康检查：

```bash
rtk docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec semantic \
  python -c 'import json,urllib.request; print(json.load(urllib.request.urlopen("http://127.0.0.1:8090/healthz")))'
```

`embedding.id/revision/dimension` 必须与 app、worker 环境一致。查询 embedding 超时、HTTP 错误、响应损坏或 identity 不匹配时，页面自动退回原有 FTS5；reranker 单独失败时保留 RRF 顺序。日志只有 request ID、操作、batch、token 数、耗时和状态，不记录查询或正文。

隔离实测中，1 vCPU 上按生产默认同时常驻 Granite 与 reranker，对 500 篇、5,230 chunks 的完整索引用时 29 分 23 秒，sidecar 峰值 681.4 MiB、cgroup swap 0；关闭 reranker 的索引跑次为 13 分 42 秒、峰值 406 MiB。两者都依赖 batch 4、关闭 ORT CPU arena/memory pattern/prepacking、`MALLOC_ARENA_MAX=1` 和推理后 `malloc_trim(0)`；删掉这些约束会在 1.2 GiB 容器限制下 OOM。

宿主机可以配置 swap 作为瞬时压力的安全网，但它不能替代资源验收：同时看 `memory.current`、`memory.peak`、`memory.swap.current` 和 `memory.swap.peak`。如果索引持续依赖大量 swap 或超过 30 分钟，应当判定配置失败，而不是把换页藏起来。

回滚必须同时恢复 `APP_IMAGE`、`SEMANTIC_IMAGE`、数据库快照和对应配置；`remote-release.sh` 已把两个 image digest 写入 current/previous release metadata。若只需紧急止血，可先停 semantic：读者搜索会降级为 FTS5，但发布产生的 embed jobs 会重试，恢复 sidecar 后再处理。不要删除旧向量来“修复”故障。

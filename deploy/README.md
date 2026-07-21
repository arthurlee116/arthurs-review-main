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

`xray-test.service`, `xray-443.service`, their configs, certificates, protocols, firewall rules, and ports are external production assets. Deployments hash and verify them before and after but never stop, restart, enable, disable, rewrite, or repair them.

The canonical HAProxy configuration is `deploy/haproxy.cfg`; `scripts/install-haproxy-config.sh` validates, reloads, health-checks, and restores the previous file on failure. `scripts/production-topology-preflight.sh` is the read-only topology and Xray-integrity gate.

#!/usr/bin/env bash
set -euo pipefail

. /etc/os-release
case "${ID}" in
  ubuntu|debian)
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y ca-certificates curl ufw rsync git cron sqlite3 util-linux haproxy
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    cron_service="cron"
    ;;
  centos)
    dnf -y install ca-certificates curl rsync git cronie sqlite util-linux haproxy dnf-plugins-core
    if [[ ! -f /etc/yum.repos.d/docker-ce.repo ]]; then
      dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    fi
    dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    cron_service="crond"
    ;;
  *)
    echo "Unsupported server OS: ${ID}" >&2
    exit 1
    ;;
esac

systemctl enable --now docker
mkdir -p /var/www/arthurs-review/data /var/www/arthurs-review/backups /opt/arthurs-review
touch /var/lock/arthurs-review-maintenance.lock
chmod 0600 /var/lock/arthurs-review-maintenance.lock
cat > /etc/cron.d/arthurs-review-backup <<'CRON'
SHELL=/bin/bash
0 3 * * * root DATA_DIR=/var/www/arthurs-review/data BACKUP_DIR=/var/www/arthurs-review/backups /opt/arthurs-review/scripts/backup-data.sh >/var/log/arthurs-review-backup.log 2>&1
CRON
chmod 0644 /etc/cron.d/arthurs-review-backup
systemctl enable --now "${cron_service}"

case "${ID}" in
  ubuntu|debian)
    ufw allow OpenSSH
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable
    ;;
  centos)
    if command -v firewall-cmd >/dev/null && systemctl is-active --quiet firewalld.service; then
      firewall-cmd --permanent --add-service=ssh
      firewall-cmd --permanent --add-port=80/tcp
      firewall-cmd --permanent --add-port=443/tcp
      firewall-cmd --reload
    fi
    ;;
esac

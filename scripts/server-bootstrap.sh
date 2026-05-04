#!/usr/bin/env bash
set -euo pipefail

apt-get update
apt-get install -y ca-certificates curl ufw rsync git cron
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
mkdir -p /var/www/arthurs-review/data /var/www/arthurs-review/backups /opt/arthurs-review
cat > /etc/cron.d/arthurs-review-backup <<'CRON'
SHELL=/bin/bash
0 3 * * * root DATA_DIR=/var/www/arthurs-review/data BACKUP_DIR=/var/www/arthurs-review/backups /opt/arthurs-review/scripts/backup-data.sh >/var/log/arthurs-review-backup.log 2>&1
CRON
chmod 0644 /etc/cron.d/arthurs-review-backup
systemctl enable --now cron >/dev/null 2>&1 || service cron start >/dev/null 2>&1 || true
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

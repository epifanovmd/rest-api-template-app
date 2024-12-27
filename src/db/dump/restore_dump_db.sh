#!/bin/bash

SSH_HOST="138.124.99.61"
BACKUP_DIR="."
CONTAINER_NAME="postgres"
PG_USER="epifanovmd"
PG_DB="postgres"
HOST_BACKUP_DIR="/var/lib/postgresql/wireguard/data"
CONTAINER_BACKUP_DIR="/var/lib/postgresql/data/pgdata"

BACKUP_FILE=$(ls -t "$BACKUP_DIR"/db_backup_*.dump | head -n 1)

# Проверяем, что файл существует
if [ -z "$BACKUP_FILE" ]; then
  echo "Файл дампа не найден!"
  exit 1
fi

scp "$BACKUP_FILE" root@$SSH_HOST:"$HOST_BACKUP_DIR"

ssh root@$SSH_HOST docker exec -i $CONTAINER_NAME pg_restore -U $PG_USER -d $PG_DB -c "$CONTAINER_BACKUP_DIR/$(basename "$BACKUP_FILE")"

ssh root@$SSH_HOST rm "$HOST_BACKUP_DIR/$(basename "$BACKUP_FILE")"

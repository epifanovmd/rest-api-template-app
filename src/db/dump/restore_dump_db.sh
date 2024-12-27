#!/bin/bash

SSH_HOST="147.45.133.109"
SSH_PROJECT_DIR="/root/development/wireguard-server"
BACKUP_DIR="."
CONTAINER_NAME="postgres"
PG_USER="epifanovmd"
PG_DB="postgres"
CONTAINER_BACKUP_DIR="/data/postgres"

BACKUP_FILE=$(ls -t "$BACKUP_DIR"/db_backup_*.dump | head -n 1)

# Проверяем, что файл существует
if [ -z "$BACKUP_FILE" ]; then
  echo "Файл дампа не найден!"
  exit 1
fi

scp "$BACKUP_FILE" root@$SSH_HOST:"$SSH_PROJECT_DIR/postgres/"

ssh root@$SSH_HOST docker exec -i $CONTAINER_NAME pg_restore -U $PG_USER -d $PG_DB -c "$CONTAINER_BACKUP_DIR/$(basename "$BACKUP_FILE")"

ssh root@$SSH_HOST rm "$SSH_PROJECT_DIR/postgres/$(basename "$BACKUP_FILE")"

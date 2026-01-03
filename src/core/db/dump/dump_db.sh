#!/bin/bash

SSH_HOST="138.124.99.61"
TIMESTAMP=$(date +"%F_%H:%M:%S")
BACKUP_DIR="."
CONTAINER_NAME="postgres"
PG_USER="epifanovmd"
PG_DB="postgres"

ssh  root@$SSH_HOST docker exec $CONTAINER_NAME pg_dump -U $PG_USER -d $PG_DB -F c -b > "$BACKUP_DIR/db_backup_$TIMESTAMP.dump"

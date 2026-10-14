# Деплой по SSH. Настройки — .env.deploy (образец .env.deploy.example); секреты
# приложения — .env.production (кладёт `make env`).
#   make release  — готовые образы коммита из ghcr (TAG=<sha>; их собирает CI)
#   make deploy   — запасной путь: исходники на хост и сборка там же
# Агент проекта (без .env.deploy):
#   make agent-archive — архив агента для узлов (все платформы) → agent/bundle (agent pack: тот же архив раздаёт API)
#   make agent-image   — образ агента из архива под эту машину ($(IMAGE):$(TAG)-agent)
AGENT_GOALS := agent-archive agent-image
ifneq ($(if $(MAKECMDGOALS),$(filter-out $(AGENT_GOALS),$(MAKECMDGOALS)),deploy),)
ifeq ($(wildcard .env.deploy),)
$(error Нет .env.deploy — скопируйте .env.deploy.example и заполните)
endif
include .env.deploy
endif
IMAGE ?= ghcr.io/epifanovmd/rest-api-template-app

TAG ?= latest
# Нестабильная сеть до хоста: повтор установки соединения (не команды) и
# keepalive на долгой сборке. Переопределяется в .env.deploy.
SSH_OPTS ?= -o ConnectTimeout=15 -o ConnectionAttempts=5 -o ServerAliveInterval=30
SSH = ssh $(SSH_OPTS) $(SSH_USER)@$(SSH_HOST)
COMPOSE = docker compose --env-file $(ENV_FILE)
REMOTE = cd $(SSH_PROJECT_DIR) && export IMAGE=$(IMAGE) TAG=$(TAG) COMPOSE_FILE=$(subst $() ,:,$(strip $(COMPOSE_FILES))) COMPOSE_PROFILES=$(subst $() ,$(),$(COMPOSE_PROFILES)) && $(COMPOSE)
LOCAL = export IMAGE=$(IMAGE) TAG=$(TAG) COMPOSE_FILE=$(subst $() ,:,$(strip $(COMPOSE_FILES))) COMPOSE_PROFILES=$(subst $() ,$(),$(COMPOSE_PROFILES)) && $(COMPOSE)
DUMP = src/core/db/dump
DB = --host $(SSH_USER)@$(SSH_HOST) --container $(DB_CONTAINER) --user $(DB_USER) --db $(DB_NAME)

.PHONY: deploy release sync compose env build pull migrate up down status logs restart db-dump db-restore image local-up local-down local-logs agent-archive agent-image

deploy: sync build migrate up
release: compose pull migrate up

sync:
	$(SSH) 'mkdir -p $(SSH_PROJECT_DIR)'
	rsync -az --delete -e "ssh $(SSH_OPTS)" --exclude-from=.deployignore ./ $(SSH_USER)@$(SSH_HOST):$(SSH_PROJECT_DIR)/

compose:
	$(SSH) 'mkdir -p $(SSH_PROJECT_DIR)'
	scp $(SSH_OPTS) $(COMPOSE_FILES) $(SSH_USER)@$(SSH_HOST):$(SSH_PROJECT_DIR)/

env:
	$(SSH) 'mkdir -p $(SSH_PROJECT_DIR)'
	scp $(SSH_OPTS) $(ENV_FILE) $(SSH_USER)@$(SSH_HOST):$(SSH_PROJECT_DIR)/$(ENV_FILE)

# По очереди: на небольшом хосте параллельная сборка упирается в память. Затем —
# сервисы профилей (COMPOSE_PROFILES), если заданы.
build:
	$(SSH) '$(REMOTE) build api && $(COMPOSE) build worker$(if $(strip $(COMPOSE_PROFILES)), && $(COMPOSE) build)'

pull:
	$(SSH) '$(REMOTE) pull'

migrate:
	$(SSH) '$(REMOTE) run --rm migrate'

up:
	$(SSH) '$(REMOTE) up -d --remove-orphans && docker image prune -f'

down:
	$(SSH) '$(REMOTE) down'

status:
	$(SSH) '$(REMOTE) ps'

logs:
	$(SSH) '$(REMOTE) logs -f --tail=200 api worker'

restart:
	$(SSH) '$(REMOTE) restart api worker'

db-dump:
	$(DUMP)/dump_db.sh $(DB) $(if $(DB_DUMP_FILE),--out $(DB_DUMP_FILE))

db-restore:
	$(DUMP)/restore_dump_db.sh $(DB) $(if $(DB_DUMP_FILE),--file $(DB_DUMP_FILE))

image:
	docker build --target worker -t $(IMAGE):$(TAG) .
	docker build --target api -t $(IMAGE):$(TAG)-api .

# --- Локально (docker на этой машине, тот же состав стека) ---
local-up:
	$(LOCAL) up -d --build --remove-orphans

local-down:
	$(LOCAL) down

local-logs:
	$(LOCAL) logs -f --tail=200 api worker

# --- Агент проекта ---
agent-archive:
	sh agent/dev.sh pack

agent-image:
	sh agent/dev.sh image $(IMAGE):$(TAG)-agent

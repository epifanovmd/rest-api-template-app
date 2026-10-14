# Агент rest-api

Архив агента для машины Linux (amd64 и arm64 — платформу выбирает сам скрипт `agent`): программы
агента (`bin/`), настройки (`agent.yaml`, `agent.prod.yaml`, `agent.docker.yaml`), воркеры проекта
(`workers/`) и их подписанные сборки (`release/`). Агент связывается с бэкендом сам — входящие
порты не нужны.

## 1. Адрес и токен

```bash
cp .env.example .env
```

Заполните `.env`: `AGENT_SERVER_URL` — адрес бэкенда, `AGENT_ENROLL_TOKEN` — токен регистрации
(выдаёт бэкенд), `AGENT_NAME` — имя агента. Если архив выдан с токеном, `.env` уже заполнен.
Без адреса и токена агент не запустится и напишет, чего не хватает (`./agent config check --env
prod`).

## 2. Запуск — любым способом

| Как                            | Команда                                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| служба systemd (root)          | `sudo ./agent install --env prod`                                                                                                |
| служба пользователя (без root) | `./agent install --env prod --rootless`                                                                                          |
| на месте, без установки        | `./agent run --env prod`                                                                                                         |
| Docker Compose                 | `docker compose up -d --build`                                                                                                   |
| Docker                         | `docker build -t agent-rest . && docker run -d --env-file .env -v agent-data:/var/lib/agent --restart unless-stopped agent-rest` |

После регистрации агент работает по своему ключу (в каталоге данных или томе), токен больше не
нужен — его можно удалить из `.env`.

## Управление

- состояние — `agent status` (служба), `./agent status --env prod` (на месте),
  `docker compose exec agent ./agent status --env docker`;
- журнал — `journalctl -u agent-rest -f` или `docker compose logs -f`;
- удалить службу — `sudo agent-rest uninstall` (`--purge` — и данные);
- обновить — новым архивом: та же команда установки или `docker compose up -d --build`.

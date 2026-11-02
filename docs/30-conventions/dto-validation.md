---
id: conventions/dto-validation
title: DTO, валидация и пагинация
summary: DTO от базового класса с fromEntity, без логики и ключей хранилища; схема валидации — только форма входа, сообщения на русском, query целиком; IPaginatedDto с normalizePagination и toPage, ICursorPageDto.
layer: stack
roles: [developer, reviewer]
stages: [implementation, review]
depends_on: [architecture/http]
---

# DTO, валидация и пагинация

## DTO

- DTO — класс, наследующий базовый DTO, с конструктором из сущности и статическим
  `fromEntity`. Вложенные DTO собираются через их `fromEntity`.
- DTO не содержит логики, кроме маппинга. Ключи хранилища наружу не выходят.
- DTO со ссылками на файлы берёт их из заранее подписанной карты
  ([files](files.md)).

## Валидация

- Схема валидации описывает форму входа: типы, обязательность, длины, форматы.
  Сообщения об ошибках — на русском.
- Схема не содержит бизнес-проверок (существование, права, статусы) — это сервис.
- Схема query перечисляет все параметры, включая `offset`/`limit` и курсор:
  результат парсинга заменяет query.
- Длины совпадают с колонками БД
  ([entities-migrations](entities-migrations.md#сущности)).

## Пагинация

Модель страниц — [architecture/http](../20-architecture/http.md#пагинация).

- Список — `IPaginatedDto { items, total, offset, limit }`: параметры проходят через
  `normalizePagination` (лимит по умолчанию и не больше 100), ответ собирается
  `toPage`.
- Лента — `ICursorPageDto { items, nextCursor }` с непрозрачным курсором.

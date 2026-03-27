# Модуль Link Preview

Сервисный модуль для извлечения и кеширования предварительного просмотра ссылок (Open Graph метаданных). Не имеет собственного контроллера — предоставляет функциональность через `LinkPreviewService`.

## Структура файлов

```
src/modules/link-preview/
├── link-preview.module.ts           # Объявление модуля (@Module)
├── link-preview.entity.ts           # Entity кеша (таблица link_previews)
├── link-preview.repository.ts       # Репозиторий
├── link-preview.service.ts          # Сервис извлечения и кеширования previews
├── link-preview.service.test.ts     # Тесты
└── index.ts                         # Публичный API модуля
```

## Entity

### LinkPreview (таблица `link_previews`)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `url` | `varchar(2048)`, unique | URL страницы |
| `title` | `varchar(500)`, nullable | Заголовок (og:title или title) |
| `description` | `text`, nullable | Описание (og:description) |
| `imageUrl` | `varchar(2048)`, nullable | URL изображения (og:image) |
| `siteName` | `varchar(200)`, nullable | Название сайта (og:site_name) |
| `fetchedAt` | `timestamp` | Время последнего получения |
| `createdAt` / `updatedAt` | `timestamp` | Временные метки |

**Индексы:** `IDX_LINK_PREVIEWS_URL` — уникальный по url

## Сервисы

### LinkPreviewService

| Метод | Описание |
|-------|----------|
| `extractUrls(content)` | Извлечь URL из текста (regex). Возвращает уникальные URL. |
| `fetchPreview(url)` | Получить preview для URL. Кеширование в БД (TTL 24 часа). Парсинг HTML через `cheerio` (og:title, og:description, og:image, og:site_name). |
| `getPreviewsForContent(content)` | Получить previews для всех URL в тексте (максимум 3). |

Ограничения:
- Максимум 3 preview на одно сообщение
- Кеш TTL: 24 часа
- HTTP-таймаут: 5 секунд
- Лимит размера HTML: 512 KB
- User-Agent: `Mozilla/5.0 (compatible; LinkPreviewBot/1.0)`

## Зависимости

| Зависимость | Откуда | Использование |
|-------------|--------|---------------|
| `cheerio` | npm | Парсинг HTML (Open Graph теги) |
| `http` / `https` | Node.js | HTTP-запросы (без внешних библиотек) |

## Взаимодействие

Используется модулем **Message** для генерации link previews при отправке сообщений, содержащих URL.

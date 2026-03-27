# Модуль Link Preview

Сервисный модуль для извлечения и кеширования предварительного просмотра ссылок (Open Graph метаданных). Не имеет собственного контроллера и REST-эндпоинтов — предоставляет функциональность другим модулям через `LinkPreviewService`.

## Структура файлов

```
src/modules/link-preview/
├── index.ts                        # Реэкспорт всех публичных модулей
├── link-preview.entity.ts          # TypeORM entity — кеш link preview в БД
├── link-preview.repository.ts      # Репозиторий с методом поиска по URL
├── link-preview.service.ts         # Бизнес-логика: извлечение URL, HTTP-загрузка, парсинг OG-тегов
├── link-preview.service.test.ts    # Unit-тесты сервиса (Mocha + Chai + Sinon)
└── link-preview.module.ts          # Объявление модуля (@Module)
```

## Entity — `LinkPreview`

Таблица: `link_previews`

| Поле          | Тип                      | Описание                             |
|---------------|--------------------------|--------------------------------------|
| `id`          | `uuid` (PK)             | Уникальный идентификатор             |
| `url`         | `varchar(2048)`, unique  | URL страницы                         |
| `title`       | `varchar(500)`, nullable | Заголовок страницы (og:title / title)|
| `description` | `text`, nullable         | Описание (og:description / meta description) |
| `imageUrl`    | `varchar(2048)`, nullable| URL изображения (og:image)           |
| `siteName`    | `varchar(200)`, nullable | Название сайта (og:site_name)        |
| `fetchedAt`   | `timestamp`              | Время последнего получения данных    |
| `createdAt`   | `timestamp`              | Дата создания записи (auto)          |
| `updatedAt`   | `timestamp`              | Дата обновления записи (auto)        |

**Индексы:**
- `IDX_LINK_PREVIEWS_URL` — уникальный индекс по полю `url`

**Связи с другими entity:** отсутствуют. Entity является автономным кешем. Данные link preview хранятся в поле `linkPreviews` (JSON) entity `Message` — связь на уровне данных, а не на уровне TypeORM-отношений.

## Endpoints

Модуль **не имеет контроллера** и не предоставляет REST-эндпоинтов. Работает исключительно как внутренний сервис для других модулей.

## Сервис — `LinkPreviewService`

### Интерфейс данных

```typescript
interface ILinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}
```

### Константы

| Константа      | Значение   | Описание                                    |
|----------------|------------|---------------------------------------------|
| `URL_REGEX`    | regex      | Регулярное выражение для поиска HTTP(S) URL |
| `MAX_PREVIEWS` | 3          | Максимальное количество preview за один запрос |
| `CACHE_TTL_MS` | 86 400 000 | Время жизни кеша — 24 часа                  |

### Основные методы

#### `extractUrls(content: string): string[]`
Извлекает все уникальные URL из текстового содержимого с помощью регулярного выражения. Возвращает дедуплицированный массив URL.

#### `fetchPreview(url: string): Promise<ILinkPreviewData | null>`
Получает preview для одного URL с кешированием в БД:
1. Проверяет наличие кеша в БД (через `LinkPreviewRepository.findByUrl`)
2. Если кеш свежий (< 24 часов) — возвращает данные из кеша
3. Если кеш устарел или отсутствует — выполняет HTTP GET запрос к URL
4. Парсит HTML с помощью **cheerio**, извлекая Open Graph теги:
   - `og:title` (fallback на `<title>`)
   - `og:description` (fallback на `<meta name="description">`)
   - `og:image`
   - `og:site_name`
5. Обрезает значения до допустимых размеров (title: 500, description: 1000, imageUrl: 2048, siteName: 200)
6. Выполняет upsert в БД (обновление существующей записи или создание новой)
7. При ошибке логирует предупреждение и возвращает `null`

#### `getPreviewsForContent(content: string): Promise<ILinkPreviewData[]>`
Высокоуровневый метод — извлекает URL из текста и получает preview для каждого:
1. Вызывает `extractUrls()` для извлечения URL
2. Ограничивает количество до `MAX_PREVIEWS` (3)
3. Параллельно запускает `fetchPreview()` для каждого URL через `Promise.allSettled`
4. Фильтрует успешные результаты, отбрасывая `null`

### Внутренний метод

#### `_httpGet(url: string): Promise<string | null>`
HTTP GET запрос с помощью нативных `http`/`https` модулей Node.js:
- User-Agent: `Mozilla/5.0 (compatible; LinkPreviewBot/1.0)`
- Accept: `text/html`
- Таймаут: 5 секунд
- Лимит размера ответа: 512 КБ
- Проверяет `Content-Type: text/html` и статус 200
- При любой ошибке возвращает `null`

## DTO

Модуль не имеет выделенных DTO-классов. Данные передаются через интерфейс `ILinkPreviewData`.

## События (Events)

Модуль не генерирует и не подписывается на события EventBus.

## Socket интеграция

Прямая socket-интеграция отсутствует. Однако данные link preview попадают в socket-уведомления опосредованно — через модуль `Message`, когда обновленное сообщение с preview рассылается через сокеты.

## Зависимости

### Внешние библиотеки
- **cheerio** — парсинг HTML и извлечение Open Graph метатегов
- **http / https** — нативные Node.js модули для HTTP-запросов

### Внутренние зависимости
- `BaseRepository` из `../../core/repository/repository`
- `@InjectableRepository` из `../../core`
- `@Injectable`, `logger` из `../../core`
- `@Module` из `../../core`

### Импортируемые модули
Модуль не импортирует другие модули (`imports` в `@Module` отсутствует).

## Взаимодействие с другими модулями

### Использование в модуле `Message`
`LinkPreviewService` инжектируется в `MessageService` и используется при создании сообщений:

1. При создании нового сообщения (не запланированного), если есть текстовое содержимое, вызывается `_fetchAndSaveLinkPreviews()`
2. Метод асинхронно (fire-and-forget с `.catch()`) вызывает `getPreviewsForContent(content)`
3. Полученные preview сохраняются в поле `linkPreviews` сущности `Message` через `messageRepo.update()`

Таким образом, link preview загружаются в фоне и не блокируют отправку сообщения пользователю.

### Регистрация
Модуль зарегистрирован в `AppModule` (`src/app.module.ts`) в массиве `imports`.

## Тесты

Файл `link-preview.service.test.ts` содержит unit-тесты для `LinkPreviewService`:

- **extractUrls**: извлечение URL из текста, пустой текст, дедупликация
- **fetchPreview**: возврат свежего кеша, перезагрузка при устаревшем кеше, обработка ошибки HTTP
- **getPreviewsForContent**: получение preview для текста с URL, пустой текст, ограничение до 3 URL

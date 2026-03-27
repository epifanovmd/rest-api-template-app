# Модуль File

Модуль управления файлами. Обеспечивает загрузку, хранение, получение и удаление файлов. Для изображений автоматически генерируются миниатюры (thumbnail) с помощью `sharp`.

## Структура файлов

```
src/modules/file/
├── file.module.ts         # Объявление модуля (@Module)
├── file.entity.ts         # Entity файла (таблица files)
├── file.repository.ts     # Репозиторий файлов
├── file.service.ts        # Сервис управления файлами
├── file.controller.ts     # REST-контроллер (tsoa)
├── file.dto.ts            # IFileDto
├── events/
│   ├── file-uploaded.event.ts # FileUploadedEvent
│   └── index.ts           # Реэкспорт событий
├── file.service.test.ts   # Тесты
└── index.ts               # Публичный API модуля
```

## Entity

### File (таблица `files`)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `name` | `varchar(255)` | Оригинальное имя файла |
| `type` | `varchar(127)` | MIME-тип |
| `url` | `varchar(2048)` | Путь к файлу |
| `size` | `int` | Размер в байтах |
| `thumbnailUrl` | `varchar(2048)`, nullable | Путь к миниатюре |
| `width` | `int`, nullable | Ширина (для изображений) |
| `height` | `int`, nullable | Высота (для изображений) |
| `createdAt` / `updatedAt` | `timestamp` | Временные метки |

**Связи:** `OneToMany` -> `Profile` (аватар)

**Метод:** `toDTO()` — преобразование в IFileDto

## Endpoints

Базовый путь: `/api/file`

| Метод | Путь | Security | Описание |
|-------|------|----------|----------|
| `GET` | `/api/file?id={id}` | `@Security("jwt")` | Получить файл по ID. |
| `POST` | `/api/file` | `@Security("jwt")` | Загрузить файл. Multipart upload. |
| `DELETE` | `/api/file/{id}` | `@Security("jwt")` | Удалить файл (из БД и с диска). |

## Сервисы

### FileService

| Метод | Описание |
|-------|----------|
| `getFileById(id)` | Получить файл. Бросает `NotFoundException`. |
| `uploadFile(files, userId?)` | Загрузить файлы. Для изображений: генерация thumbnail (200x200, webp, quality 70). Эмитит `FileUploadedEvent`. |
| `deleteFile(id)` | Удалить файл из БД и с файловой системы. |

## DTO

- **IFileDto** — id, name, type, url, size, thumbnailUrl, width, height, createdAt, updatedAt

## События (Events)

| Событие | Данные | Когда |
|---------|--------|-------|
| `FileUploadedEvent` | `fileId`, `userId`, `type` | При загрузке файла (если передан userId) |

## Зависимости

| Зависимость | Откуда | Использование |
|-------------|--------|---------------|
| `sharp` | npm | Генерация thumbnail для изображений |
| `config.server.filesFolderPath` | `config` | Путь к директории файлов |
| `EventBus` | `core` | Публикация FileUploadedEvent |

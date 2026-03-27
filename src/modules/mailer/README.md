# Mailer Module

Модуль отправки электронной почты через SMTP (Gmail). Предоставляет сервис для отправки email-сообщений с использованием HTML-шаблонов (EJS). Используется другими модулями для отправки одноразовых кодов подтверждения (OTP) и ссылок для сброса пароля.

## Структура файлов

```
src/modules/mailer/
├── mailer.module.ts                    # Объявление модуля (@Module)
├── mailer.service.ts                   # Сервис отправки email
├── mailer.service.test.ts              # Unit-тесты сервиса
├── html-code-template.ejs              # EJS-шаблон письма с OTP-кодом
├── html-reset-password-template.ejs    # EJS-шаблон письма для сброса пароля
└── index.ts                            # Публичный экспорт (MailerModule, MailerService)
```

## Entity

Модуль не имеет собственной entity. Является инфраструктурным сервисом без хранения данных в БД.

## Endpoints

Модуль не предоставляет собственных HTTP-эндпоинтов (нет контроллера). Используется исключительно как внутренний сервис, инжектируемый в другие модули.

## Сервис — MailerService

Основной и единственный сервис модуля. Создает SMTP-транспорт через `nodemailer` при инициализации и предоставляет методы для отправки писем.

### Конфигурация

Транспорт создается в конструкторе с использованием Gmail SMTP:

- `config.email.smtp.user` — email-адрес отправителя (Gmail)
- `config.email.smtp.pass` — пароль приложения Gmail

Эти значения берутся из переменных окружения и валидируются через Zod-схему в `src/config.ts`.

### Методы

#### `sendCodeMail(email: string, code: string): Promise<any>`

Отправляет письмо с одноразовым кодом подтверждения (OTP).

- **Шаблон:** `html-code-template.ejs`
- **Тема письма:** "Ваш одноразовый код"
- **Переменные шаблона:** `code` — одноразовый код
- **Используется в:** `UserService.sendOtp()` — отправка OTP-кода для верификации email пользователя

#### `sendResetPasswordMail(email: string, token: string): Promise<any>`

Отправляет письмо со ссылкой для сброса пароля.

- **Шаблон:** `html-reset-password-template.ejs`
- **Тема письма:** "Ваша ссылка для востановления пароля"
- **Переменные шаблона:** `resetLink` — URL для сброса пароля, формируется из `config.auth.resetPassword.webUrl` с подстановкой токена вместо `{{token}}`
- **Используется в:** `AuthService.forgotPassword()` — инициирование процедуры сброса пароля

#### `sendMail(options: Omit<SendMailOptions, "from">): Promise<any>`

Низкоуровневый метод отправки произвольного письма. Поле `from` подставляется автоматически из конфига (`config.email.smtp.user`).

- **Параметры:** все поля `nodemailer.SendMailOptions` кроме `from` (to, subject, html, text и т.д.)
- **Возвращает:** Promise с информацией об отправке (messageId, accepted и т.д.)
- **Ошибки:** Promise отклоняется при ошибке SMTP-транспорта

## DTO

Модуль не определяет собственных DTO. Входные параметры передаются напрямую в методы сервиса (email, code, token).

## HTML-шаблоны

### html-code-template.ejs

Шаблон письма для OTP-верификации:
- Заголовок "OTP Verification"
- Отображает переданный код крупным синим шрифтом
- Адаптивная верстка с максимальной шириной 600px

### html-reset-password-template.ejs

Шаблон письма для сброса пароля:
- Заголовок "Password Reset"
- Содержит кнопку-ссылку "Reset Password" с переданным URL
- Текст предупреждения: если пользователь не запрашивал сброс — игнорировать письмо

Оба шаблона используют EJS-синтаксис (`<%= переменная %>`) и имеют единый стиль оформления (синяя цветовая схема, копирайт "Force-dev").

## События (Events)

Модуль не генерирует и не подписывается на доменные события через EventBus.

## Socket-интеграция

Модуль не имеет socket-интеграции.

## Зависимости

### Внешние пакеты

- `nodemailer` — SMTP-транспорт для отправки email
- `ejs` — шаблонизатор для рендеринга HTML-писем
- `fs` — чтение файлов шаблонов с диска

### Внутренние зависимости

- `src/config.ts` — конфигурация SMTP (email/пароль) и URL для сброса пароля
- `src/core` — декораторы `@Injectable()` и `@Module()`

Модуль не импортирует другие модули приложения (`imports: []` в `@Module`).

## Взаимодействие с другими модулями

### AuthService (`src/modules/auth/auth.service.ts`)

Инжектирует `MailerService` для отправки письма со ссылкой сброса пароля:

```typescript
await this._mailerService.sendResetPasswordMail(user.email, resetToken.token);
```

Вызывается в методе `forgotPassword()` после генерации токена сброса пароля через `ResetPasswordTokensService`.

### UserService (`src/modules/user/user.service.ts`)

Инжектирует `MailerService` для отправки письма с OTP-кодом верификации email:

```typescript
await this._mailerService.sendCodeMail(email, otp.code);
```

Вызывается в методе `sendOtp()` после создания OTP-кода через `OtpService`.

### AppModule (`src/app.module.ts`)

`MailerModule` импортируется в корневой `AppModule`, что регистрирует `MailerService` в IoC-контейнере и делает его доступным для инжекции во всех других модулях.

## Тесты

Файл `mailer.service.test.ts` содержит unit-тесты с использованием Mocha + Chai + Sinon:

- **sendCodeMail** — проверяет отправку письма с OTP-кодом (корректные to, subject, html с кодом, from из конфига)
- **sendResetPasswordMail** — проверяет отправку письма со ссылкой сброса пароля (корректные to, subject, html с токеном, from из конфига)
- **sendMail** — проверяет обработку ошибок SMTP (reject при ошибке) и успешную отправку (resolve с messageId)

Транспорт мокается через `sinon.stub()` для изоляции от реального SMTP-сервера.

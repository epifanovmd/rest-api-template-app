# Модуль Mailer

Сервисный модуль отправки электронной почты через SMTP (Gmail). Предоставляет функциональность для отправки email-сообщений с HTML-шаблонами (EJS). Не имеет собственного контроллера и REST-эндпоинтов.

## Структура файлов

```
src/modules/mailer/
├── mailer.module.ts                     # Объявление модуля (@Module)
├── mailer.service.ts                    # Сервис отправки email
├── html-code-template.ejs              # EJS-шаблон для одноразового кода
├── html-reset-password-template.ejs    # EJS-шаблон для сброса пароля
├── mailer.service.test.ts              # Тесты
└── index.ts                            # Публичный API модуля
```

## Сервисы

### MailerService

Использует `nodemailer` с Gmail SMTP. Конфигурация: `config.email.smtp.user`, `config.email.smtp.pass`.

| Метод | Описание |
|-------|----------|
| `sendCodeMail(email, code)` | Отправить письмо с одноразовым кодом подтверждения. |
| `sendResetPasswordMail(email, token)` | Отправить письмо со ссылкой для сброса пароля. URL из `config.auth.resetPassword.webUrl`. |
| `sendMail(options)` | Отправить произвольное письмо. Поле `from` подставляется автоматически. |

## Шаблоны

- **html-code-template.ejs** — шаблон для OTP-кода (переменная `code`)
- **html-reset-password-template.ejs** — шаблон для сброса пароля (переменная `resetLink`)

## Зависимости

| Зависимость | Откуда | Использование |
|-------------|--------|---------------|
| `nodemailer` | npm | SMTP-транспорт |
| `ejs` | npm | Рендеринг HTML-шаблонов |
| `config.email.smtp` | `config` | Учётные данные SMTP |
| `config.auth.resetPassword.webUrl` | `config` | URL для ссылки сброса пароля |

## Взаимодействие

Используется модулями:
- **OTP** — отправка кода подтверждения через `sendCodeMail()`
- **Auth/User** — отправка ссылки сброса пароля через `sendResetPasswordMail()`

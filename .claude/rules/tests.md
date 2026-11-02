---
paths:
  - "src/**/*.test.ts"
  - "src/test/**"
  - "test/**"
  - ".mocharc*.yml"
---

# Тесты

- Тест проверяет поведение; багфикс — тест, падающий до исправления
  ([conventions/tests](../../docs/30-conventions/tests.md), [bugfix](../../docs/10-process/bugfix.md)).
- Хелперы и моки — `src/test`; e2e — настоящий сервер на одноразовом стенде, никогда не
  против удалённой БД ([tech/testing](../../docs/50-tech/testing.md), [ops/e2e](../../docs/70-ops/e2e.md)).

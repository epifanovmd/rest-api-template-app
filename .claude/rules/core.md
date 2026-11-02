---
paths:
  - "src/core/**"
  - "src/types/**"
  - "src/common/**"
  - "src/middleware/**"
  - "src/routing/*.ts"
  - "src/app*.ts"
  - "src/main.ts"
---

# Ядро

- Ядро не импортирует модули (страж-тест); расширение — токенами-реестрами
  ([extension-points](../../docs/20-architecture/extension-points.md),
  [dependencies](../../docs/20-architecture/dependencies.md)).
- Перед правкой — README подсистемы; карта — [docs/modules.md](../../docs/modules.md).
- Порядок bootstrap и реализации реестров — [tech/bootstrap](../../docs/50-tech/bootstrap.md),
  HTTP-конвейер и системные маршруты — [tech/http](../../docs/50-tech/http.md).

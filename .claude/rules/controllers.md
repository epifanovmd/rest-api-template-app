---
paths:
  - "src/**/*.controller.ts"
  - "src/**/*.dto.ts"
  - "src/**/dto/**"
  - "src/**/validation/**"
---

# Контроллеры и DTO

- Маршруты `api/v1/...`, `@Response<IErrorResponseDto>("default")`, path-id — `UUID`,
  `@Path()` на каждом параметре; создание — 201, без тела — 204
  ([controllers](../../docs/30-conventions/controllers.md), [http](../../docs/20-architecture/http.md)).
- Вход — Zod-схемой декоратором, длины совпадают с колонками БД
  ([dto-validation](../../docs/30-conventions/dto-validation.md)).
- После правки DTO или контроллера — `yarn generate`, иначе tsoa молча отбросит новые поля;
  новый эндпоинт — со сценарием в `test/e2e`.

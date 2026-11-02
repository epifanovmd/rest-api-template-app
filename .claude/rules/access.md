---
paths:
  - "src/**/*.permissions.ts"
  - "src/**/*.access.ts"
  - "src/core/guards/**"
  - "src/core/auth/**"
---

# Доступ и права

- Security-scope — право (`permission:<домен>:<действие>`), не роль; права модуля —
  `definePermissions` в `<feature>.permissions.ts`
  ([architecture/access](../../docs/20-architecture/access.md)).
- Роли, права и схемы аутентификации проекта — [domain/access](../../docs/60-domain/access.md).

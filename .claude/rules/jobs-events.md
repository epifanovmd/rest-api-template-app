---
paths:
  - "src/**/*.job.ts"
  - "src/**/*.listener.ts"
  - "src/**/events/**"
  - "src/**/*.socket-events.ts"
  - "src/core/jobs/**"
  - "src/core/event-bus/**"
---

# Задачи, события, реальное время

- Фоновая работа — `IJobHandler` + `asJobHandler`, постановка с `manager` транзакции;
  периодическая — только `cron` в `definition` ([jobs](../../docs/20-architecture/jobs.md)).
- Реакция между модулями — `EventBus`, события после транзакции; доставка клиентам — в
  listener через эмиттер; входящие события сокета — `onValidated`
  ([events-realtime](../../docs/20-architecture/events-realtime.md)).
- Изменение очереди — с её интеграционным тестом ([tech/testing](../../docs/50-tech/testing.md)).

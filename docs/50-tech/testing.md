---
id: tech/testing
title: Тесты — юнит и e2e
summary: Mocha + Chai + Sinon, расположение и запуск, хелперы и фейки src/test/helpers.ts, скелет теста сервиса, интеграционные тесты, e2e-сценарии.
layer: project
roles: [tester, developer]
stages: [implementation, verification]
depends_on: [ops/e2e]
---

# Тесты — юнит и e2e

Общие правила тестов — [conventions/tests](../30-conventions/tests.md).

## Юнит-тесты

- Mocha + Chai + Sinon; `.mocharc.yml`: `require: tsx`, `spec: src/**/*.test.ts`,
  timeout 10 с. Тест лежит рядом с кодом: `<file>.test.ts`.
- `yarn test` — все; `yarn test:file <path>` — файл или glob.
- Интеграционные юнит-тесты без env пропускаются (pending):
  `TEST_DATABASE_URL` — `modules/jobs/jobs.integration.test.ts` (настоящий pg-boss),
  `TEST_S3_ENDPOINT` — `modules/storage/s3-file.storage.test.ts`. Запускать только на
  одноразовых сервисах ([ops/e2e](../70-ops/e2e.md#правило)).

## Хелперы — `src/test/helpers.ts`

| Хелпер                                            | Двойник                                |
| ------------------------------------------------- | -------------------------------------- |
| `createMockRepository`, `createMockQueryBuilder`  | репозиторий TypeORM и query builder    |
| `createMockEntityManager`, `createMockDataSource` | транзакции (`transaction(cb)`)         |
| `createMockEventBus`                              | `EventBus` (`emit`, `emitAsync`, `on`) |
| `createMockEmitter`                               | `SocketEmitterService`                 |
| `createMockJobQueue`                              | `JobQueue.enqueue`                     |
| `createMockFileStorage`                           | `FileStorage`                          |
| `uuid`, `uuid2`, `uuid3`                          | фиксированные id                       |

Подмена presence в тестах — токен `PRESENCE_STORE`.

## Скелет теста сервиса

```ts
import "reflect-metadata";

import { expect } from "chai";

import { HttpException } from "../../core";
import {
  createMockDataSource,
  createMockEventBus,
  createMockRepository,
  uuid,
} from "../../test/helpers";
import { FeatureError } from "./feature.errors";
import { FeatureService } from "./feature.service";

const expectCode = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
    expect.fail("должно было упасть");
  } catch (err) {
    expect(err).to.be.instanceOf(HttpException);
    expect((err as HttpException).code).to.equal(code);
  }
};

describe("FeatureService", () => {
  let repo: ReturnType<typeof createMockRepository>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let service: FeatureService;

  beforeEach(() => {
    repo = createMockRepository();
    eventBus = createMockEventBus();
    service = new FeatureService(
      repo as any,
      eventBus as any,
      createMockDataSource() as any,
    );
  });

  it("несуществующая запись — NOT_FOUND", async () => {
    repo.findOne.resolves(null);
    await expectCode(service.get(uuid), FeatureError.codes.NOT_FOUND);
  });
});
```

- Ошибки сравниваются по `code`, не по тексту.
- Сервис собирается конструктором с двойниками, без DI-контейнера.
- `z.string().uuid()` (Zod 4) не принимает `uuid()` из хелперов (`00000000-…-0001`) —
  в тестах сокет-схем нужны v4-подобные id (`11111111-1111-4111-8111-111111111111`).

## Стражи проекта

| Тест                                    | Что ловит                                                    |
| --------------------------------------- | ------------------------------------------------------------ |
| `src/core/auth/core-boundaries.test.ts` | импорт модулей из `src/core`, `src/types`, `src/common`      |
| `src/modules/module-boundaries.test.ts` | импорт чужого модуля мимо `index.ts` (кроме `*.entity`)      |
| `src/core/db/entity-registry.test.ts`   | сущности, не собранные из модулей                            |
| `src/routing/spec.test.ts`              | дубли `operationId`, невыполнимые схемы, необъявленные права |
| `modules/mailer/mail-renderer.test.ts`  | неполные наборы шаблонов писем по локалям                    |

## E2E

Стенд, переменные и правило одноразовой инфраструктуры — [ops/e2e](../70-ops/e2e.md).

- Сценарий — `describe`/`it` в `test/e2e/<область>.e2e.ts`; один сервер на прогон,
  состояние между тестами общее — создавать своих пользователей (`uniqueEmail`, `signUp`).
- HTTP — `call`/`expectStatus` из `client.ts`; администратор — `signInAdmin()`;
  асинхронный результат — `eventually(...)`.
- Письма — Mailpit: `mail`, `codeFrom`, `tokenFrom`.
- Сокеты — `connectSocket(actor)` из `socket.ts`.
- Несколько реплик — `startPeerServer()` из `harness.ts`.
- Каждый новый эндпоинт вызывается хотя бы одним сценарием ([ops/e2e](../70-ops/e2e.md)).

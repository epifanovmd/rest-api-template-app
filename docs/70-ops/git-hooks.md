---
id: ops/git-hooks
title: Git-хуки
summary: lefthook — pre-commit (prettier и eslint по застейдженным, typecheck, тесты), commit-msg (Conventional Commits).
layer: project
roles: [devops, developer]
stages: [commit]
depends_on: [process/git]
---

# Git-хуки

## lefthook — `lefthook.yml`

Устанавливается при `yarn` (`prepare: lefthook install`). Хуки не обходятся
(`--no-verify` — только по команде пользователя, [process/git](../10-process/git.md)).

### pre-commit (последовательно)

| Job         | Что                                                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| `prettier`  | застейдженные `*.{ts,json,md,yml,yaml}` → `prettier --write`, кроме `src/routing/swagger.json` и `routes.ts`; `stage_fixed` |
| `eslint`    | застейдженные `src/**/*.ts` → `eslint --fix`, кроме `src/routing/routes.ts` и `src/migrations/**`; `stage_fixed`            |
| `typecheck` | `yarn typecheck`                                                                                                            |
| `test`      | `yarn test` (юнит-тесты целиком)                                                                                            |

### commit-msg

`node scripts/git/commit-msg.mjs <файл сообщения>` — формат Conventional Commits на
русском: `<type>(<scope>)!: <описание>`, типы `feat fix refactor perf test docs style
build ci chore revert`, заголовок до 100 символов. Merge, revert, `fixup!`/`squash!`
проходят как есть. Правила — [process/git](../10-process/git.md).

## Что хуки не проверяют

`yarn test:e2e`, `yarn build` и актуальность `src/routing` — их
ловят полная проверка и CI ([commands](commands.md), [ci-deploy](ci-deploy.md)).

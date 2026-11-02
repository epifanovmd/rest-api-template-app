---
name: new-module
description: Создание нового модуля проекта в правильном месте по правилам размещения — с public API, регистрацией и README. Применять, когда задаче нужен новый модуль.
argument-hint: "[что за модуль и зачем]"
---

# Новый модуль

1. Место и имя — по [placement](../../../docs/20-architecture/placement.md) и
   [naming](../../../docs/30-conventions/naming.md). Неоднозначно — спросить.
2. Проверить, нет ли уже подходящего модуля: [docs/modules.md](../../../docs/modules.md).
3. Структура и регистрация — по эталону [recipes](../../../docs/50-tech/recipes.md);
   генератор каркаса, если он есть, — [ops/commands](../../../docs/70-ops/commands.md).
4. `README.md` по [шаблону](../../../docs/00-meta/templates/module-readme.md).
5. `yarn docs:index` и быстрая проверка ([ops/commands](../../../docs/70-ops/commands.md)).

Модуль: $ARGUMENTS

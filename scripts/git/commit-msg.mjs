#!/usr/bin/env node
/**
 * commit-msg: Conventional Commits на русском (docs/10-process/git.md).
 * Вызов: node scripts/git/commit-msg.mjs <файл сообщения>
 */
import fs from "node:fs";

const TYPES = [
  "feat",
  "fix",
  "refactor",
  "perf",
  "test",
  "docs",
  "style",
  "build",
  "ci",
  "chore",
  "revert",
];
const HEADER_MAX = 100;
const HEADER = new RegExp(
  `^(${TYPES.join("|")})(\\([a-z0-9][a-z0-9/,-]*\\))?(!)?: (.+)$`,
);

const file = process.argv[2];

if (!file) {
  console.error("commit-msg: не передан файл сообщения");
  process.exit(1);
}

const lines = fs
  .readFileSync(file, "utf8")
  .split("\n")
  .filter(line => !line.startsWith("#"));
const header = (lines[0] ?? "").trim();

if (/^(Merge |Revert "|fixup! |squash! |amend! )/.test(header)) process.exit(0);

const problems = [];
const match = HEADER.exec(header);

if (!match) {
  problems.push(
    `заголовок не по формату <type>(<scope>)!: <описание>; type — ${TYPES.join(", ")}`,
  );
} else {
  const subject = match[4];

  if (/^[A-ZА-ЯЁ]/.test(subject)) problems.push("описание — со строчной буквы");
  if (!/[а-яё]/i.test(subject)) problems.push("описание — на русском");
  if (/\.$/.test(subject)) problems.push("без точки в конце заголовка");
}

if (header.length > HEADER_MAX)
  problems.push(
    `заголовок ${header.length} символов — не больше ${HEADER_MAX}; подробности — в теле`,
  );
if (lines.length > 1 && lines[1].trim() !== "")
  problems.push("между заголовком и телом — пустая строка");

if (problems.length) {
  console.error(
    `✖ Сообщение коммита не по правилам (docs/10-process/git.md):\n  ${header}\n`,
  );
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\nПример: feat(files): прогресс загрузки файла в списке");
  process.exit(1);
}

import { expect } from "chai";
import { readdirSync, readFileSync } from "fs";
import { dirname, join, relative, resolve, sep } from "path";

const SRC = resolve(__dirname, "..");
const MODULES = join(SRC, "modules");

/** import/export … from "x", import("x"), require("x"). */
const SPECIFIER_RE =
  /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm;

const listCodeFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) return listCodeFiles(path);

    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
      ? [path]
      : [];
  });

/** Модуль, которому принадлежит путь внутри `src/modules`, иначе `null`. */
const moduleOf = (path: string): string | null =>
  path.startsWith(MODULES + sep) ? relative(MODULES, path).split(sep)[0] : null;

/**
 * Импорт чужого модуля допустим через его `index.ts` или — исключение — из файла
 * сущности `*.entity`: связи и репозитории TypeORM, публичный API модуля сущности
 * не отдаёт.
 */
const isAllowedForeignImport = (
  target: string,
  targetModule: string,
): boolean =>
  target === join(MODULES, targetModule) ||
  target === join(MODULES, targetModule, "index") ||
  /\.entity$/.test(target);

/**
 * Известные нарушения до отдельного исправления — импорт через index даёт цикл
 * загрузки: модуль socket (инфраструктура) знает события profile; DTO user и
 * profile вкладывают друг друга. Развязка — предложение в docs/inbox.
 */
const KNOWN_DEEP_IMPORTS = new Set([
  "modules/socket/socket.bootstrap.ts → ../profile/events",
  "modules/user/dto/user.dto.ts → ../../profile/dto",
  "modules/profile/dto/profile.dto.ts → ../../user/dto",
]);

const findDeepImports = (files: string[]): string[] =>
  files.flatMap(file => {
    const source = readFileSync(file, "utf8");
    const ownModule = moduleOf(file);

    return [...source.matchAll(SPECIFIER_RE)]
      .map(match => match[1])
      .filter(spec => spec.startsWith("."))
      .filter(spec => {
        const target = resolve(dirname(file), spec);
        const targetModule = moduleOf(target);

        return (
          targetModule !== null &&
          targetModule !== ownModule &&
          !isAllowedForeignImport(target, targetModule)
        );
      })
      .map(spec => `${relative(SRC, file)} → ${spec}`)
      .filter(entry => !KNOWN_DEEP_IMPORTS.has(entry));
  });

/** Архитектурный страж: модули и композиционный корень видят чужой модуль через его `index.ts`. */
describe("Границы модулей", () => {
  it("src/modules/** импортирует чужой модуль через index.ts (кроме *.entity)", () => {
    expect(findDeepImports(listCodeFiles(MODULES))).to.deep.equal([]);
  });

  it("корневые файлы src/*.ts импортируют модули через index.ts", () => {
    const rootFiles = readdirSync(SRC, { withFileTypes: true })
      .filter(
        e =>
          e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".test.ts"),
      )
      .map(e => join(SRC, e.name));

    expect(findDeepImports(rootFiles)).to.deep.equal([]);
  });
});

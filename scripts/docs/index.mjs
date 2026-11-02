#!/usr/bin/env node
/**
 * Индекс системы документации.
 *
 *   node scripts/docs/index.mjs --write  — пересборка docs/README.md и docs/modules.md
 *                                          (с отчётом об ошибках формата документов)
 *
 * Правила формата — docs/00-meta/authoring.md.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as prettier from "prettier";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const DOCS = path.join(ROOT, "docs");
const WRITE = process.argv.includes("--write");

const LAYERS = ["core", "stack", "project"];
const ROLES = [
  "all",
  "developer",
  "architect",
  "tester",
  "reviewer",
  "devops",
  "documenter",
];
const STAGES = [
  "any",
  "intake",
  "analysis",
  "planning",
  "implementation",
  "verification",
  "review",
  "docs",
  "commit",
];
const DOC_FIELDS = [
  "id",
  "title",
  "summary",
  "layer",
  "roles",
  "stages",
  "depends_on",
];
/** Корень исходников: README модулей ищутся в нём. */
const SRC_DIR = "src";
const CLAUDE_MD_MAX_LINES = 150;
const DOC_MAX_LINES = 200;
const GENERATED = ["docs/README.md", "docs/modules.md"];
const SKIP_DIRS = new Set([
  "build",
  "vendor",
  "Pods",
  ".gradle",
  ".cxx",
  "node_modules",
  ".git",
  "dist",
  "coverage",
  ".tanstack",
  ".idea",
]);

const errors = [];
const warnings = [];

const rel = file => path.relative(ROOT, file).split(path.sep).join("/");
const error = (file, message) => errors.push(`${rel(file)}: ${message}`);
const warn = (file, message) => warnings.push(`${rel(file)}: ${message}`);

const walk = (dir, filter, acc = []) => {
  if (!fs.existsSync(dir)) return acc;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) walk(full, filter, acc);
    else if (filter(full)) acc.push(full);
  }

  return acc;
};

/** Подмножество YAML: `key: value`, `key: [a, b]`, `key:` + строки `- item`. */
const parseFrontmatter = text => {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);

  if (!match) return null;

  const data = {};
  let listKey = null;

  for (const line of match[1].split("\n")) {
    const item = /^\s+-\s+(.*)$/.exec(line);

    if (item && listKey) {
      data[listKey].push(unquote(item[1]));
      continue;
    }

    const pair = /^([\w-]+):\s*(.*)$/.exec(line);

    if (!pair) continue;

    const [, key, raw] = pair;

    listKey = null;

    if (raw === "") {
      data[key] = [];
      listKey = key;
    } else if (raw.startsWith("[")) {
      data[key] = raw
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map(v => unquote(v.trim()))
        .filter(Boolean);
    } else {
      data[key] = unquote(raw);
    }
  }

  return { data, body: text.slice(match[0].length) };
};

const unquote = value => value.replace(/^["']|["']$/g, "");

const read = file => fs.readFileSync(file, "utf8");

const asList = value => (Array.isArray(value) ? value : value ? [value] : []);

// ---------- документы docs/ ----------

const docIdOf = file =>
  rel(file)
    .replace(/^docs\//, "")
    .replace(/^\d\d-/, "")
    .replace(/\.md$/, "");

const isTemplate = file => rel(file).startsWith("docs/00-meta/templates/");
const isInboxEntry = file =>
  rel(file).startsWith("docs/inbox/") && path.basename(file) !== "README.md";
const isGenerated = file => GENERATED.includes(rel(file));

const docFiles = walk(DOCS, f => f.endsWith(".md")).filter(
  f => !isTemplate(f) && !isGenerated(f) && !isInboxEntry(f),
);

const docs = new Map();

for (const file of docFiles) {
  const text = read(file);
  const fm = parseFrontmatter(text);

  if (!fm) {
    error(file, "нет frontmatter");
    continue;
  }

  const { data } = fm;

  for (const field of DOC_FIELDS) {
    if (!(field in data)) error(file, `нет поля ${field}`);
  }

  const expectedId = docIdOf(file);

  if (data.id !== expectedId)
    error(
      file,
      `id "${data.id}" не совпадает с путём (ожидается "${expectedId}")`,
    );
  if (data.layer && !LAYERS.includes(data.layer))
    error(file, `layer "${data.layer}" не из ${LAYERS.join("/")}`);

  for (const role of asList(data.roles)) {
    if (!ROLES.includes(role))
      error(file, `роль "${role}" не из ${ROLES.join("/")}`);
  }

  for (const stage of asList(data.stages)) {
    if (!STAGES.includes(stage))
      error(file, `этап "${stage}" не из ${STAGES.join("/")}`);
  }

  if (!data.summary) error(file, "пустой summary");
  if (docs.has(data.id)) error(file, `дубликат id "${data.id}"`);

  const lines = text.split("\n").length;

  if (lines > DOC_MAX_LINES)
    warn(file, `${lines} строк — больше ${DOC_MAX_LINES}, стоит разделить`);

  docs.set(data.id, {
    file,
    ...data,
    roles: asList(data.roles),
    stages: asList(data.stages),
    depends_on: asList(data.depends_on),
  });
}

for (const doc of docs.values()) {
  for (const dep of doc.depends_on) {
    if (!docs.has(dep)) error(doc.file, `depends_on: нет документа "${dep}"`);
  }
}

const findCycle = () => {
  const state = new Map();

  const visit = (id, trail) => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "active")
      return [...trail.slice(trail.indexOf(id)), id];

    state.set(id, "active");

    for (const dep of docs.get(id)?.depends_on ?? []) {
      if (!docs.has(dep)) continue;

      const cycle = visit(dep, [...trail, id]);

      if (cycle) return cycle;
    }

    state.set(id, "done");

    return null;
  };

  for (const id of docs.keys()) {
    const cycle = visit(id, []);

    if (cycle) return cycle;
  }

  return null;
};

const cycle = findCycle();

if (cycle) errors.push(`docs: цикл depends_on: ${cycle.join(" → ")}`);

for (const file of walk(path.join(DOCS, "inbox"), f =>
  f.endsWith(".md"),
).filter(isInboxEntry)) {
  const fm = parseFrontmatter(read(file));

  if (!fm)
    error(file, "нет frontmatter (шаблон docs/00-meta/templates/inbox.md)");
  else
    for (const field of ["status", "target", "date"])
      if (!fm.data[field]) error(file, `нет поля ${field}`);
}

// ---------- README модулей (для карты, без проверки) ----------

const modules = walk(
  path.join(ROOT, SRC_DIR),
  f => path.basename(f) === "README.md",
).map(file => ({
  file,
  module: rel(path.dirname(file)).slice(SRC_DIR.length + 1),
  summary: parseFrontmatter(read(file))?.data.summary ?? "",
}));

// ---------- .claude: rules, skills, agents ----------

const CLAUDE_DIR = path.join(ROOT, ".claude");

for (const file of walk(path.join(CLAUDE_DIR, "rules"), f =>
  f.endsWith(".md"),
)) {
  const fm = parseFrontmatter(read(file));
  const patterns = asList(fm?.data.paths);

  if (!patterns.length) {
    error(
      file,
      "правило без paths — грузилось бы всегда; общие правила — в CLAUDE.md",
    );
    continue;
  }

  for (const pattern of patterns) {
    const matches = fs.globSync(pattern, {
      cwd: ROOT,
      exclude: name => SKIP_DIRS.has(path.basename(name)),
    });

    if (!matches.length)
      error(file, `paths "${pattern}" не совпадает ни с одним файлом`);
  }
}

for (const file of walk(
  path.join(CLAUDE_DIR, "skills"),
  f => path.basename(f) === "SKILL.md",
)) {
  const fm = parseFrontmatter(read(file));
  const dirName = path.basename(path.dirname(file));

  if (!fm) error(file, "нет frontmatter");
  else {
    if (fm.data.name !== dirName)
      error(file, `name "${fm.data.name}" не совпадает с папкой "${dirName}"`);
    if (!fm.data.description) error(file, "нет description");
  }
}

for (const file of walk(path.join(CLAUDE_DIR, "agents"), f =>
  f.endsWith(".md"),
)) {
  const fm = parseFrontmatter(read(file));

  if (!fm?.data.name || !fm?.data.description)
    error(file, "нужны name и description");
  else if (fm.data.name !== path.basename(file, ".md"))
    error(file, `name "${fm.data.name}" не совпадает с именем файла`);
}

const claudeMd = path.join(ROOT, "CLAUDE.md");

if (fs.existsSync(claudeMd)) {
  const lines = read(claudeMd).trimEnd().split("\n").length;

  if (lines > CLAUDE_MD_MAX_LINES)
    error(claudeMd, `${lines} строк — больше ${CLAUDE_MD_MAX_LINES}`);
} else errors.push("CLAUDE.md: файл отсутствует");

// ---------- индексы ----------

const link = (from, file) =>
  path
    .relative(path.dirname(path.join(ROOT, from)), file)
    .split(path.sep)
    .join("/");

const docLink = (from, doc) => `[${doc.id}](${link(from, doc.file)})`;

const sortedDocs = [...docs.values()].sort((a, b) =>
  rel(a.file).localeCompare(rel(b.file)),
);

const groupBy = (items, key) =>
  items.reduce((acc, item) => {
    for (const value of key(item)) (acc[value] ??= []).push(item);

    return acc;
  }, {});

const buildDocsIndex = () => {
  const from = "docs/README.md";
  const sections = groupBy(sortedDocs, doc => [rel(doc.file).split("/")[1]]);
  const inbox = walk(path.join(DOCS, "inbox"), isInboxEntry).sort();
  const out = [
    "<!-- Сгенерировано scripts/docs/index.mjs (yarn docs:index). Не редактировать вручную. -->",
    "",
    "# Документация проекта",
    "",
    "Единая система знаний: как она устроена — [meta/doc-system](00-meta/doc-system.md),",
    "как добавить документ — [meta/authoring](00-meta/authoring.md). Документы модулей —",
    "[modules.md](modules.md). Номер папки — приоритет при конфликте.",
    "",
    "## Документы",
    "",
  ];

  for (const [section, items] of Object.entries(sections)) {
    out.push(
      `### ${section}`,
      "",
      "| Документ | О чём | Слой | Роли | Этапы |",
      "| --- | --- | --- | --- | --- |",
    );

    for (const doc of items) {
      out.push(
        `| ${docLink(from, doc)} | ${doc.summary} | ${doc.layer} | ${doc.roles.join(", ")} | ${doc.stages.join(", ")} |`,
      );
    }

    out.push("");
  }

  const listBy = (title, values, key) => {
    out.push(`## ${title}`, "");

    const groups = groupBy(sortedDocs, key);

    for (const value of values) {
      const items = groups[value];

      if (items?.length)
        out.push(
          `- **${value}**: ${items.map(d => docLink(from, d)).join(", ")}`,
        );
    }

    out.push("");
  };

  listBy("По этапам", STAGES, doc => doc.stages);
  listBy("По ролям", ROLES, doc => doc.roles);

  out.push(
    "## Граф зависимостей",
    "",
    "| Документ | Зависит от |",
    "| --- | --- |",
  );

  for (const doc of sortedDocs.filter(d => d.depends_on.length)) {
    out.push(
      `| ${docLink(from, doc)} | ${doc.depends_on.map(id => (docs.has(id) ? docLink(from, docs.get(id)) : id)).join(", ")} |`,
    );
  }

  out.push("", "## Предложения в inbox", "");
  out.push(
    ...(inbox.length
      ? inbox.map(
          f => `- [${path.basename(f, ".md")}](inbox/${path.basename(f)})`,
        )
      : ["Открытых предложений нет."]),
  );

  return out.join("\n") + "\n";
};

const buildModulesIndex = () => {
  const from = "docs/modules.md";
  const out = [
    "<!-- Сгенерировано scripts/docs/index.mjs (yarn docs:index). Не редактировать вручную. -->",
    "",
    "# Модули",
    "",
    `Документация модулей лежит рядом с кодом: \`${SRC_DIR}/<модуль>/README.md\`. Шаблон —`,
    "[module-readme](00-meta/templates/module-readme.md).",
    "",
  ];
  const byLayer = groupBy(
    [...modules].sort((a, b) => a.module.localeCompare(b.module)),
    m => [m.module.split("/")[0]],
  );

  for (const [layer, items] of Object.entries(byLayer).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    out.push(`## ${layer}`, "", "| Модуль | О чём |", "| --- | --- |");

    for (const m of items)
      out.push(`| [${m.module}](${link(from, m.file)}) | ${m.summary} |`);

    out.push("");
  }

  return out.join("\n");
};

const format = async (file, text) => {
  const options = (await prettier.resolveConfig(file)) ?? {};

  return prettier.format(text, { ...options, filepath: file });
};

const generated = {
  "docs/README.md": await format(
    path.join(ROOT, "docs/README.md"),
    buildDocsIndex(),
  ),
  "docs/modules.md": await format(
    path.join(ROOT, "docs/modules.md"),
    buildModulesIndex(),
  ),
};

for (const [file, content] of Object.entries(generated)) {
  const full = path.join(ROOT, file);

  if (WRITE) fs.writeFileSync(full, content);
  else if (!fs.existsSync(full) || read(full) !== content)
    errors.push(`${file}: индекс устарел — выполнить yarn docs:index`);
}

// ---------- ссылки ----------

const linkSources = [
  claudeMd,
  path.join(ROOT, "README.md"),
  ...walk(DOCS, f => f.endsWith(".md") && !isTemplate(f)),
  ...walk(CLAUDE_DIR, f => f.endsWith(".md")),
  ...modules.map(m => m.file),
].filter(f => fs.existsSync(f));

const stripCode = text =>
  text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");

for (const file of linkSources) {
  const text = stripCode(read(file));

  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;

    const clean = decodeURI(target.split("#")[0]);
    const resolved = path.resolve(path.dirname(file), clean);

    if (!fs.existsSync(resolved)) error(file, `битая ссылка ${target}`);
  }
}

// ---------- итог ----------

for (const message of warnings) console.warn(`⚠ ${message}`);

if (errors.length) {
  for (const message of errors) console.error(`✖ ${message}`);
  console.error(`\ndocs:index — ошибок: ${errors.length}`);
  process.exit(1);
}

console.log(
  `docs:index — ок: документов ${docs.size}, модулей ${modules.length}, правил, skills и агентов проверено${WRITE ? "; индексы пересобраны" : ""}`,
);

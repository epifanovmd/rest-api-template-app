import { LINK_PATH } from "agent-sdk";
import type { ConnectConfig } from "ssh2";

import { JobContext, JobError } from "../../core";
import type { ISshSession } from "./ssh-runner";

/** Значение в одинарных кавычках POSIX sh. */
export const shQuote = (value: string): string =>
  `'${value.replace(/'/g, `'\\''`)}'`;

/**
 * Рабочий каталог на узле: свой на каждый запуск (`mktemp -d`, 0700,
 * владелец — пользователь SSH). Предсказуемый путь в /tmp дал бы другому
 * пользователю узла подменить установщик до запуска от root.
 */
export const WORK_DIR_COMMAND = "mktemp -d /tmp/agent-node.XXXXXXXX";

/** Путь из вывода `mktemp` — только такой попадает в команды. */
export const WORK_DIR_PATTERN = /^\/tmp\/agent-node\.[A-Za-z0-9]+$/;

/** Установщик агента на этом сервере. */
export const installScriptUrl = (backendUrl: string): string =>
  `${backendUrl.replace(/\/+$/, "")}${LINK_PATH}/install.sh`;

/** Как повышать права: sudo без пароля (`-n`) или с паролем в stdin (`-S`). */
export interface ISshPrivilege {
  sudo: boolean;
  password?: string;
}

/** Шаг плана: команда, нужен ли root, срок. */
export interface ISshStep {
  title: string;
  command: string;
  privileged: boolean;
  timeoutMs: number;
}

/** Команда с повышением прав и что подать в stdin. */
export const elevate = (
  command: string,
  privilege: ISshPrivilege,
): { command: string; stdin?: string } => {
  if (!privilege.sudo) return { command };
  if (privilege.password) {
    return {
      command: `sudo -S -p '' sh -c ${shQuote(command)}`,
      stdin: `${privilege.password}\n`,
    };
  }

  return { command: `sudo -n sh -c ${shQuote(command)}` };
};

/** Файлы в рабочем каталоге: установщик и токен регистрации. */
export const workFiles = (workDir: string) => ({
  script: `${workDir}/install.sh`,
  token: `${workDir}/token`,
});

/** Скачать установщик с сервера (curl, иначе wget) — без root. */
const downloadStep = (workDir: string, backendUrl: string): ISshStep => {
  const url = shQuote(installScriptUrl(backendUrl));
  const script = workFiles(workDir).script;

  return {
    title: "Загрузка установщика с сервера",
    command:
      `if command -v curl >/dev/null 2>&1; then curl -fsSL ${url} -o ${script}; ` +
      `else wget -qO ${script} ${url}; fi`,
    privileged: false,
    timeoutMs: 120_000,
  };
};

/**
 * Установка: установщик сервера ставит зависимости, скачивает агента и
 * воркеры из выпуска, регистрирует агента токеном и запускает службу. Токен — файлом
 * (`--token-file`): в аргументах его видел бы любой пользователь узла.
 */
export const buildInstallPlan = (
  workDir: string,
  backendUrl: string,
  workers: string[] = [],
): ISshStep[] => {
  const files = workFiles(workDir);

  return [
    downloadStep(workDir, backendUrl),
    {
      title: "Установка агента",
      command:
        `sh ${files.script} --server ${shQuote(backendUrl)} --token-file ${files.token}` +
        `${workers.map(worker => ` --worker ${shQuote(worker)}`).join("")}; ` +
        `code=$?; rm -rf ${workDir}; exit $code`,
      privileged: true,
      timeoutMs: 900_000,
    },
  ];
};

/**
 * Удаление: воркеры убирают за собой, служба и программа агента удаляются;
 * `purge` — ещё конфигурация, данные, пакеты и пользователь службы.
 */
export const buildUninstallPlan = (
  workDir: string,
  backendUrl: string,
  purge: boolean,
): ISshStep[] => [
  downloadStep(workDir, backendUrl),
  {
    title: "Удаление агента",
    command:
      `sh ${workFiles(workDir).script} --uninstall${purge ? " --purge" : ""}; ` +
      `code=$?; rm -rf ${workDir}; exit $code`,
    privileged: true,
    timeoutMs: 300_000,
  },
];

/**
 * Выполнить план с прогрессом в диапазоне [from, to] и выводом команд в
 * журнал задачи построчно; шаг с ненулевым кодом — ошибка без повторов.
 */
export const runSshPlan = async (
  ctx: JobContext<unknown>,
  session: Pick<ISshSession, "exec">,
  plan: ISshStep[],
  privilege: ISshPrivilege,
  range: { from: number; to: number },
): Promise<void> => {
  for (const [index, step] of plan.entries()) {
    if (ctx.signal.aborted) {
      throw new JobError("NODE_JOB_CANCELLED", "Задача отменена", false);
    }

    await ctx.progress(
      range.from + ((range.to - range.from) * index) / plan.length,
      step.title,
    );
    await ctx.log(`▶ ${step.title}`);

    const logged: Promise<void>[] = [];
    const { command, stdin } = step.privileged
      ? elevate(step.command, privilege)
      : { command: step.command, stdin: undefined };
    const result = await session.exec(command, {
      timeoutMs: step.timeoutMs,
      stdin,
      onLine: line => {
        if (line.trim()) logged.push(ctx.log(line));
      },
    });

    await Promise.all(logged);
    if (result.code !== 0) {
      throw new JobError(
        "NODE_SSH_STEP_FAILED",
        `${step.title}: код ${result.code}${result.stderr ? `: ${result.stderr.trim().slice(-500)}` : ""}`,
        false,
      );
    }
  }
};

/** Рабочий каталог на узле (`mktemp -d` от пользователя SSH, без sudo). */
export const createWorkDir = async (
  session: Pick<ISshSession, "exec">,
): Promise<string> => {
  const result = await session.exec(WORK_DIR_COMMAND, { timeoutMs: 30_000 });
  const dir = result.stdout.trim();

  if (result.code !== 0 || !WORK_DIR_PATTERN.test(dir)) {
    throw new JobError(
      "NODE_SSH_WORKDIR_FAILED",
      `Не удалось создать рабочий каталог: ${(result.stderr || dir).slice(0, 200)}`,
      false,
    );
  }

  return dir;
};

/**
 * Удалить рабочий каталог, если план до этого не дошёл (обрыв, ошибка):
 * токен не остаётся на диске. Ошибки не мешают итогу задачи.
 */
export const removeWorkDir = async (
  session: Pick<ISshSession, "exec">,
  dir: string,
): Promise<void> => {
  await session
    .exec(`rm -rf ${dir}`, { timeoutMs: 30_000 })
    .catch(() => undefined);
};

/** Параметры подключения и повышения прав из данных задачи. */
export const sshAccessOf = (
  data: {
    host: string;
    port: number;
    username: string;
    sudo: boolean;
    passwordEnc?: string;
    privateKeyEnc?: string;
    passphraseEnc?: string;
  },
  open: (sealed: string) => string,
): { connect: ConnectConfig; privilege: ISshPrivilege } => {
  const password = data.passwordEnc ? open(data.passwordEnc) : undefined;

  return {
    connect: {
      host: data.host,
      port: data.port,
      username: data.username,
      password,
      privateKey: data.privateKeyEnc ? open(data.privateKeyEnc) : undefined,
      passphrase: data.passphraseEnc ? open(data.passphraseEnc) : undefined,
    },
    privilege: { sudo: data.sudo, password },
  };
};

/** Ошибка задачи: своя — как есть, прочая — без повторов с кодом `code`. */
export const toJobError = (err: unknown, code: string): JobError =>
  err instanceof JobError
    ? err
    : new JobError(
        code,
        err instanceof Error ? err.message : String(err),
        false,
      );

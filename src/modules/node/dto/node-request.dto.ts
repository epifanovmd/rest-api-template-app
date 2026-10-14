import type { AgentInstallMode } from "../../agent";

/** Способ установки по SSH: служба или агент без root (`run` занял бы сеанс SSH). */
export type TNodeSshInstallMode = "systemd" | "rootless";

export interface ICreateNodeBody {
  name: string;
  description?: string | null;
  /** Публичный адрес (имя хоста или IP). */
  host?: string | null;
  /** Владелец; отличный от себя — только с правом `node:assign`. */
  ownerId?: string | null;
}

export interface IUpdateNodeBody {
  name?: string;
  description?: string | null;
  host?: string | null;
}

export interface IAssignNodeBody {
  /** Новый владелец. */
  userId: string;
}

/** Команда установки агента на узел вручную. */
export interface ICreateNodeInstallCommandBody {
  /**
   * Способ установки: `systemd` (по умолчанию) — служба от root, `rootless` —
   * агент пользователя без root, `run` — без установки, агент на переднем плане,
   * `docker` — Docker Compose из архива агента; кроме `systemd` — команда без sudo.
   */
  mode?: AgentInstallMode;
  /** Адрес сервера для агента; без него — `AGENT_PUBLIC_URL` / `APP_PUBLIC_URL`. */
  baseUrl?: string;
  /** Срок одноразового токена, минут (по умолчанию сутки). */
  expiresInMinutes?: number;
}

/**
 * Выдача агента узла: `.env` (адрес, токен с меткой узла, имя агента), архив с ним или
 * одноразовая ссылка на архив.
 */
export interface IIssueNodeAgentBody {
  /** Имя агента; нет — прежнее имя агента узла или имя узла. */
  name?: string;
  /** Адрес сервера для агента; без него — `AGENT_PUBLIC_URL` / `APP_PUBLIC_URL`. */
  baseUrl?: string;
  /** Срок одноразового токена, минут (по умолчанию сутки). */
  expiresInMinutes?: number;
}

export interface IIssueNodeAgentLinkBody extends IIssueNodeAgentBody {
  /** Срок ссылки, минут (по умолчанию сутки); токен создаётся при скачивании. */
  linkExpiresInMinutes?: number;
}

/** Команда установки и одноразовый токен регистрации узла. */
export interface INodeInstallCommandDto {
  /** `curl …/agent/v1/bundle/install.sh | sudo sh -s -- --token …` (`rootless`, `run` — без sudo). */
  command: string;
  /** Токен регистрации (одноразовый, с меткой узла) — только в этом ответе. */
  token: string;
  tokenId: string;
  expiresAt: Date;
}

/**
 * Доступ к узлу по SSH (данные шифруются и живут только в задаче) и адрес
 * сервера.
 */
export interface INodeSshAccessBody {
  /**
   * Способ установки по SSH: `systemd` (по умолчанию) — служба от root,
   * `rootless` — агент пользователя SSH без root (без sudo). Удаление агента без
   * root — тоже `rootless`.
   */
  mode?: TNodeSshInstallMode;
  /** Хост SSH; без него — `host` узла. */
  host?: string;
  /** Порт SSH (по умолчанию 22). */
  port?: number;
  /** Пользователь SSH (по умолчанию root). */
  username?: string;
  /** Пароль SSH (и для sudo, если он требует пароль). */
  password?: string;
  /** Приватный ключ SSH (PEM). */
  privateKey?: string;
  /** Пароль приватного ключа. */
  passphrase?: string;
  /**
   * Повышать права через sudo (по умолчанию — если пользователь не root);
   * агент без root (`mode: rootless`) ставится и удаляется без sudo.
   */
  sudo?: boolean;
  /**
   * Адрес сервера, доступный с узла: установщик и связь агента; без него —
   * `AGENT_PUBLIC_URL` / `APP_PUBLIC_URL`.
   */
  backendUrl?: string;
}

/** Установка агента по SSH: архив папки агента с этого сервера. */
export type IInstallNodeAgentBody = INodeSshAccessBody;

/** Удаление агента по SSH; `mode: rootless` — агент без root удаляется без sudo. */
export interface IUninstallNodeAgentBody extends INodeSshAccessBody {
  /** Удалить и данные, конфигурацию, пакеты и пользователя службы. */
  purge?: boolean;
}

/** Поставленная задача узла. */
export interface INodeJobStartedDto {
  /** Id задачи: прогресс и журнал — `GET /api/v1/jobs/{id}`, комната узла. */
  jobId: string;
}

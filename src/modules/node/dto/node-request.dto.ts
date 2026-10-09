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
  /** Адрес сервера для агента; без него — `AGENT_PUBLIC_URL` / `APP_PUBLIC_URL`. */
  baseUrl?: string;
  /** Срок одноразового токена, минут (по умолчанию сутки). */
  expiresInMinutes?: number;
  /** Воркеры из выпуска агента (по умолчанию — проверка сети `netprobe`). */
  workers?: string[];
}

/** Команда установки и одноразовый токен регистрации узла. */
export interface INodeInstallCommandDto {
  /** `curl … | sudo sh -s -- --token … --server …`. */
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
  /** Повышать права через sudo (по умолчанию — если пользователь не root). */
  sudo?: boolean;
  /**
   * Адрес сервера, доступный с узла: установщик и связь агента; без него —
   * `AGENT_PUBLIC_URL` / `APP_PUBLIC_URL`.
   */
  backendUrl?: string;
}

/** Установка агента по SSH. */
export interface IInstallNodeAgentBody extends INodeSshAccessBody {
  /** Воркеры из выпуска агента (по умолчанию — проверка сети `netprobe`). */
  workers?: string[];
}

/** Удаление агента по SSH. */
export interface IUninstallNodeAgentBody extends INodeSshAccessBody {
  /** Удалить и данные, конфигурацию, пакеты и пользователя службы. */
  purge?: boolean;
}

/** Поставленная задача узла. */
export interface INodeJobStartedDto {
  /** Id задачи: прогресс и журнал — `GET /api/v1/jobs/{id}`, комната узла. */
  jobId: string;
}

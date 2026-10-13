import type { TNodeSshInstallMode } from "./dto";

/** Максимальная длина названия — совпадает с колонкой `name`. */
export const NODE_NAME_MAX = 120;
/** Максимальная длина описания. */
export const NODE_DESCRIPTION_MAX = 2000;
/** Максимальная длина публичного адреса (имя хоста или IP). */
export const NODE_HOST_MAX = 255;
/** Длина имени агента узла (как у agent-sdk). */
export const NODE_AGENT_NAME_MAX = 128;

/**
 * Статус узла — вычисляется при выдаче, не хранится:
 * - `created` — агента нет и задачи установки нет («Ожидает агента»);
 * - `provisioning` — идёт задача установки или удаления агента;
 * - `online` / `offline` — агент на связи или нет;
 * - `error` — последняя задача установки провалилась и агента нет, либо у
 *   агента на связи воркер не зарегистрирован (`invalid`), упал или не в
 *   порядке (`health.ok: false`), или воркер отказал в настройке.
 */
export enum ENodeStatus {
  Created = "created",
  Provisioning = "provisioning",
  Online = "online",
  Offline = "offline",
  Error = "error",
}

/**
 * Сводка настроек воркеров агента узла (ключи `воркер/ключ`):
 * - `synced` — всё заданное применено;
 * - `applying` — агент на связи, новая версия ещё не применена;
 * - `error` — воркер отказал в настройке;
 * - `awaitingAgent` — агента нет или он не на связи, а применить есть что.
 */
export enum ENodeConfigStatus {
  Synced = "synced",
  Applying = "applying",
  Error = "error",
  AwaitingAgent = "awaitingAgent",
}

/** Что делает задача узла. */
export enum ENodeJobKind {
  Install = "install",
  Uninstall = "uninstall",
}

/** Комната списка узлов (право на все узлы). */
export const NODES_ROOM = "nodes";

/** Тип комнаты узла для `room:subscribe { type, id }`. */
export const NODE_ROOM_TYPE = "node";

/** Комната узла: изменения узла и его задач. */
export const nodeRoom = (nodeId: string): string =>
  `${NODE_ROOM_TYPE}_${nodeId}`;

/**
 * Scope задач узла. Совпадает с типом комнаты: обновления задач приходят в
 * комнату узла `node_<id>`.
 */
export const NODE_JOB_SCOPE = NODE_ROOM_TYPE;

/** Очередь установки агента по SSH. */
export const NODE_INSTALL_QUEUE = "node.install-agent";

/** Очередь удаления агента по SSH. */
export const NODE_UNINSTALL_QUEUE = "node.uninstall-agent";

/** Очередь задачи → вид задачи узла. */
export const NODE_JOB_KINDS: Record<string, ENodeJobKind> = {
  [NODE_INSTALL_QUEUE]: ENodeJobKind.Install,
  [NODE_UNINSTALL_QUEUE]: ENodeJobKind.Uninstall,
};

/**
 * Метка токена регистрации с id узла: агент, зарегистрированный таким
 * токеном, привязывается к узлу.
 */
export const NODE_ID_LABEL = "nodeId";

/** Срок токена команды установки, минут (по умолчанию). */
export const NODE_INSTALL_TOKEN_TTL_MINUTES = 24 * 60;

/** Срок токена установки по SSH, минут: задача короче. */
export const NODE_SSH_TOKEN_TTL_MINUTES = 60;

/** Нагрузка узла (`node:load`) по сокету — не чаще, мс на узел. */
export const NODE_LOAD_EMIT_MS = 5_000;

/** SSH-доступ в данных задачи узла: секреты зашифрованы `NodeSecretBox`. */
export interface INodeSshJobData {
  nodeId: string;
  /** Кто запустил: от его имени действия с агентом. */
  actorId: string;
  host: string;
  port: number;
  username: string;
  sudo: boolean;
  passwordEnc?: string;
  privateKeyEnc?: string;
  passphraseEnc?: string;
  /** Адрес сервера: установщик и связь агента. */
  backendUrl: string;
  /** Способ установки агента: нет — служба systemd. */
  mode?: TNodeSshInstallMode;
}

/** Данные задачи установки: одноразовый токен регистрации зашифрован. */
export interface INodeInstallJobData extends INodeSshJobData {
  tokenId: string;
  tokenEnc: string;
}

/** Данные задачи удаления. */
export interface INodeUninstallJobData extends INodeSshJobData {
  purge: boolean;
}

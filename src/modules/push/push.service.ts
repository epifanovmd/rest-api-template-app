import { cert, initializeApp } from "firebase-admin/app";
import {
  type BatchResponse,
  getMessaging,
  type Messaging,
} from "firebase-admin/messaging";
import { inject } from "inversify";

import { Injectable, JobError, JobQueue, logger } from "../../core";
import { DeviceTokenRepository } from "./device-token.repository";
import { NotificationSettingsRepository } from "./notification-settings.repository";
import { pushConfig } from "./push.config";
import { PushError } from "./push.errors";
import {
  IPushDelivery,
  IPushPayload,
  PUSH_SEND_QUEUE,
  TPushMessage,
  TPushSendJobData,
} from "./push.types";

/** Текст уведомления, когда получатель скрыл превью. */
const HIDDEN_PREVIEW = {
  title: "Новое уведомление",
  body: "Откройте приложение, чтобы посмотреть",
};

/** Токен больше не действует — удаляется. */
const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

/** Временный сбой FCM — токен отправляется повторно. */
const TRANSIENT_CODES = new Set([
  "messaging/internal-error",
  "messaging/server-unavailable",
  "messaging/unknown-error",
  "messaging/message-rate-exceeded",
]);

/** Сколько раз повторять токены с временным сбоем. */
export const PUSH_MAX_RETRIES = 5;

/** Задержка повтора: 30 с, 60 с, 120 с… */
const retryDelaySeconds = (retry: number) => 30 * 2 ** retry;

interface IDeliveryGroup {
  showPreview: boolean;
  soundEnabled: boolean;
  tokens: string[];
}

const buildMessage = (
  payload: IPushPayload,
  { showPreview, soundEnabled }: IDeliveryGroup,
): TPushMessage => ({
  notification: showPreview
    ? { title: payload.title, body: payload.body }
    : (payload.hiddenPreview ?? HIDDEN_PREVIEW),
  data: payload.data,
  android: {
    notification: soundEnabled
      ? { sound: "default", defaultSound: true }
      : { defaultSound: false },
  },
  apns: {
    payload: { aps: soundEnabled ? { sound: "default" } : {} },
  },
});

/**
 * Push через очередь: `sendToUsers` ставит задачу `push.send`, обработчик
 * (`PushSendJob`) вызывает `deliver`. Невалидные токены удаляются, токены
 * с временным сбоем FCM уходят отдельной задачей с задержкой — повтор не
 * дублирует уже доставленные уведомления.
 */
@Injectable()
export class PushService {
  private _messaging: Messaging | null = null;

  constructor(
    @inject(DeviceTokenRepository)
    private _tokenRepo: DeviceTokenRepository,
    @inject(NotificationSettingsRepository)
    private _settingsRepo: NotificationSettingsRepository,
    @inject(JobQueue) private _jobs: JobQueue,
  ) {
    this._initFirebase();
  }

  async sendToUser(userId: string, payload: IPushPayload): Promise<void> {
    await this.sendToUsers([userId], payload);
  }

  /** Поставить уведомление пользователям в очередь; без Firebase — ничего. */
  async sendToUsers(userIds: string[], payload: IPushPayload): Promise<void> {
    if (!this._messaging || userIds.length === 0) return;

    const data: TPushSendJobData = { userIds: [...new Set(userIds)], payload };

    await this._jobs.enqueue(PUSH_SEND_QUEUE, data);
  }

  /**
   * Отправить синхронно — только для обработчика `push.send`. Учитывает
   * настройки получателя: `muteAll` — не отправлять, `showPreview = false`
   * — обезличенный текст, `soundEnabled` — звук. Токены группируются по
   * настройкам: одна multicast-рассылка на группу.
   */
  async deliver(data: TPushSendJobData): Promise<void> {
    if (!this._messaging) return;

    const deliveries =
      "userIds" in data
        ? await this._resolveDeliveries(data.userIds, data.payload)
        : data.deliveries;
    const retry = "retry" in data ? data.retry : 0;
    const failed: IPushDelivery[] = [];

    for (const delivery of deliveries) {
      const tokens = await this._sendToTokens(delivery);

      if (tokens.length > 0) failed.push({ ...delivery, tokens });
    }

    if (failed.length === 0) return;

    if (retry >= PUSH_MAX_RETRIES) {
      logger.warn(
        { tokens: failed.reduce((n, d) => n + d.tokens.length, 0) },
        "[Push] повторы исчерпаны — уведомления не доставлены",
      );

      return;
    }

    const next: TPushSendJobData = { deliveries: failed, retry: retry + 1 };

    try {
      await this._jobs.enqueue(PUSH_SEND_QUEUE, next, {
        startAfter: retryDelaySeconds(retry),
      });
    } catch (err) {
      logger.error({ err }, "[Push] не удалось поставить повтор");
      throw new JobError(
        PushError.codes.DELIVERY_FAILED,
        "Не удалось поставить повтор push-уведомлений",
        false,
      );
    }
  }

  private _initFirebase() {
    const { serviceAccountPath } = pushConfig;

    if (!serviceAccountPath) {
      logger.warn(
        "Firebase service account path not configured — push disabled",
      );

      return;
    }

    try {
      this._messaging = getMessaging(
        initializeApp({ credential: cert(serviceAccountPath) }),
      );
      logger.info("Firebase Admin SDK initialized");
    } catch (err) {
      logger.error({ err }, "Failed to initialize Firebase Admin SDK");
    }
  }

  private async _resolveDeliveries(
    userIds: string[],
    payload: IPushPayload,
  ): Promise<IPushDelivery[]> {
    if (userIds.length === 0) return [];

    const tokens = await this._tokenRepo.findByUserIds([...new Set(userIds)]);

    if (tokens.length === 0) return [];

    const uniqueUserIds = [...new Set(tokens.map(t => t.userId))];
    const allSettings = await this._settingsRepo.findByUserIds(uniqueUserIds);
    const settingsByUser = new Map(allSettings.map(s => [s.userId, s]));
    const groups = new Map<string, IDeliveryGroup>();

    for (const token of tokens) {
      const settings = settingsByUser.get(token.userId);

      if (settings?.muteAll) continue;

      const showPreview = settings?.showPreview ?? true;
      const soundEnabled = settings?.soundEnabled ?? true;
      const key = `${showPreview}:${soundEnabled}`;
      const group = groups.get(key) ?? {
        showPreview,
        soundEnabled,
        tokens: [],
      };

      group.tokens.push(token.token);
      groups.set(key, group);
    }

    return [...groups.values()].map(group => ({
      tokens: group.tokens,
      message: buildMessage(payload, group),
    }));
  }

  /** Отправить рассылку; вернуть токены для повтора (временный сбой). */
  private async _sendToTokens({
    tokens,
    message,
  }: IPushDelivery): Promise<string[]> {
    if (!this._messaging || tokens.length === 0) return [];

    let response: BatchResponse;

    try {
      response = await this._messaging.sendEachForMulticast({
        ...message,
        tokens,
      });
    } catch (err) {
      logger.error({ err }, "[Push] FCM недоступен — рассылка будет повторена");

      return tokens;
    }

    if (response.failureCount === 0) return [];

    const invalid: string[] = [];
    const transient: string[] = [];

    response.responses.forEach((resp, idx) => {
      if (resp.success) return;

      const code = resp.error?.code ?? "";

      if (INVALID_TOKEN_CODES.has(code)) invalid.push(tokens[idx]);
      else if (TRANSIENT_CODES.has(code)) transient.push(tokens[idx]);
    });

    if (invalid.length > 0) {
      await this._tokenRepo.deleteByTokens(invalid);
      logger.info({ count: invalid.length }, "Removed invalid FCM tokens");
    }

    return transient;
  }
}

import admin from "firebase-admin";
import { inject } from "inversify";

import { config } from "../../config";
import { Injectable } from "../../core";
import { logger } from "../../core/logger";
import { DeviceTokenRepository } from "./device-token.repository";
import { NotificationSettingsRepository } from "./notification-settings.repository";
import { IPushPayload } from "./push.types";

@Injectable()
export class PushService {
  private _app: admin.app.App | null = null;

  constructor(
    @inject(DeviceTokenRepository)
    private _tokenRepo: DeviceTokenRepository,
    @inject(NotificationSettingsRepository)
    private _settingsRepo: NotificationSettingsRepository,
  ) {
    this._initFirebase();
  }

  private _initFirebase() {
    const { serviceAccountPath } = config.firebase;

    if (!serviceAccountPath) {
      logger.warn("Firebase service account path not configured — push disabled");

      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const serviceAccount = require(serviceAccountPath);

      this._app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      logger.info("Firebase Admin SDK initialized");
    } catch (err) {
      logger.error({ err }, "Failed to initialize Firebase Admin SDK");
    }
  }

  async sendToUser(userId: string, payload: IPushPayload): Promise<void> {
    if (!this._app) return;

    // Проверяем настройки уведомлений
    const settings = await this._settingsRepo.findByUserId(userId);

    if (settings?.muteAll) return;

    const tokens = await this._tokenRepo.findByUserId(userId);

    if (tokens.length === 0) return;

    await this._sendToTokens(
      tokens.map(t => t.token),
      payload,
    );
  }

  async sendToUsers(userIds: string[], payload: IPushPayload): Promise<void> {
    if (!this._app || userIds.length === 0) return;

    const tokens = await this._tokenRepo.findByUserIds(userIds);

    if (tokens.length === 0) return;

    // Batch-загрузка настроек уведомлений (вместо N+1 цикла)
    const uniqueUserIds = [...new Set(tokens.map(t => t.userId))];
    const allSettings = await this._settingsRepo.findByUserIds(uniqueUserIds);
    const mutedUserIds = new Set(
      allSettings.filter(s => s.muteAll).map(s => s.userId),
    );

    const filteredTokens = tokens
      .filter(t => !mutedUserIds.has(t.userId))
      .map(t => t.token);

    if (filteredTokens.length === 0) return;

    await this._sendToTokens(filteredTokens, payload);
  }

  private async _sendToTokens(
    tokens: string[],
    payload: IPushPayload,
  ): Promise<void> {
    if (!this._app || tokens.length === 0) return;

    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data,
    };

    try {
      const response = await this._app.messaging().sendEachForMulticast(message);

      // Удаляем невалидные токены
      if (response.failureCount > 0) {
        const invalidTokens: string[] = [];

        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;

            if (
              errorCode === "messaging/invalid-registration-token" ||
              errorCode === "messaging/registration-token-not-registered"
            ) {
              invalidTokens.push(tokens[idx]);
            }
          }
        });

        if (invalidTokens.length > 0) {
          await this._tokenRepo.deleteByTokens(invalidTokens);
          logger.info({ count: invalidTokens.length }, "Removed invalid FCM tokens");
        }
      }
    } catch (err) {
      logger.error({ err }, "Failed to send push notifications");
    }
  }
}

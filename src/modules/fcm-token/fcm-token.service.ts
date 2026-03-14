import {
  InternalServerErrorException,
  NotFoundException,
} from "@force-dev/utils";
import axios, { AxiosInstance } from "axios";
import admin from "firebase-admin";
import { Message } from "firebase-admin/lib/messaging/messaging-api";
import fs from "fs";
import { inject } from "inversify";
import path from "path";

import { config } from "../../config";
import { Injectable, logger } from "../../core";
import { IApnRegisterTokenResponseDto, IFCMMessageDto } from "./fcm-token.dto";
import { FcmTokenRepository } from "./fcm-token.repository";

const BATCH_IMPORT_URL = "https://iid.googleapis.com/iid/v1:batchImport";

@Injectable()
export class FcmTokenService {
  private _accessToken: string | undefined = undefined;
  private _firebaseApp: admin.app.App | null = null;
  private _firebaseCredential: admin.credential.Credential | null = null;

  private _fetch: AxiosInstance = axios.create({
    timeout: 2 * 60 * 1000,
    withCredentials: true,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  constructor(
    @inject(FcmTokenRepository) private _fcmTokenRepository: FcmTokenRepository,
  ) {
    this._initializeFirebase();

    this._fetch.interceptors.request.use(requestConfig => {
      if (this._accessToken) {
        requestConfig.headers.Authorization = `Bearer ${this._accessToken}`;
      }

      return requestConfig;
    });
  }

  async getTokens(userId: string) {
    const tokens = await this._fcmTokenRepository.findByUserId(userId);

    if (!tokens || tokens.length === 0) {
      throw new NotFoundException("FCM tokens not found");
    }

    return tokens;
  }

  async getToken(id: number) {
    const token = await this._fcmTokenRepository.findById(id);

    if (!token) {
      throw new NotFoundException("FCM token not found");
    }

    return token;
  }

  async addToken(userId: string, token: string) {
    try {
      const existingToken = await this._fcmTokenRepository.findByToken(token);

      if (existingToken) {
        return existingToken;
      }

      return await this._fcmTokenRepository.createAndSave({
        userId,
        token,
      });
    } catch (error) {
      throw new InternalServerErrorException(error.message, error);
    }
  }

  async deleteToken(id: number) {
    const deleted = await this._fcmTokenRepository.delete(id);

    if (!deleted) {
      throw new NotFoundException("FCM token not found");
    }

    return true;
  }

  async deleteTokens(userId: string) {
    return await this._fcmTokenRepository
      .delete({ userId })
      .then(res => !!res.affected);
  }

  async getAccessToken(): Promise<string> {
    if (!this._firebaseCredential) {
      throw new InternalServerErrorException("Firebase не инициализирован.");
    }

    const token = await this._firebaseCredential.getAccessToken();

    this._accessToken = token.access_token;

    return this._accessToken;
  }

  async sendFcmMessage(message: IFCMMessageDto): Promise<string> {
    if (!this._firebaseApp) {
      throw new InternalServerErrorException("Firebase не инициализирован.");
    }

    try {
      return await this._firebaseApp
        .messaging()
        .send(this._getMessagePayload(message));
    } catch (e) {
      throw new InternalServerErrorException("Failed to send FCM message", e);
    }
  }

  async getFcmToken(apnsToken: string) {
    if (!this._firebaseApp) {
      logger.warn("Firebase not initialized");

      return;
    }

    try {
      const tokenData = await admin.auth().verifyIdToken(apnsToken);

      logger.debug({ fcmToken: tokenData.fcmToken }, "FCM token retrieved");

      return tokenData.fcmToken;
    } catch (error) {
      logger.error({ err: error }, "Error retrieving FCM token");
    }
  }

  async registerApnToken(
    apns_tokens: string[],
    application: string,
    sandbox: boolean,
  ) {
    if (!this._firebaseApp) {
      throw new InternalServerErrorException("Firebase не инициализирован.");
    }

    await this.getAccessToken();

    const response = await this._fetch.post<IApnRegisterTokenResponseDto>(
      BATCH_IMPORT_URL,
      JSON.stringify({
        application,
        sandbox,
        apns_tokens,
      }),
    );

    return response.data;
  }

  private _initializeFirebase(): void {
    const serviceAccountPath = path.join(
      process.cwd(),
      config.fcm.serviceAccountPath,
    );

    try {
      if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);

        this._firebaseCredential = admin.credential.cert(serviceAccount);
        this._firebaseApp = admin.initializeApp({
          credential: this._firebaseCredential,
        });
        logger.info("Firebase Admin initialized successfully");

        this._firebaseCredential
          .getAccessToken()
          .then(token => {
            this._accessToken = token.access_token;
          })
          .catch(err =>
            logger.error({ err }, "Failed to pre-fetch Firebase access token"),
          );
      } else {
        logger.warn(
          `Firebase service account not found at "${serviceAccountPath}". Firebase features will be unavailable.`,
        );
      }
    } catch (error) {
      logger.error({ err: error }, "Firebase Admin initialization error");
    }
  }

  private _getMessagePayload = (message: IFCMMessageDto): Message => ({
    data: message.data,
    ...(message.type === "topic"
      ? { topic: message.to }
      : { token: message.to }),
    notification: {
      title: message.message.title,
      body: message.message.description,
      imageUrl: message.message.image,
    },
    android: {
      notification: {
        title: message.message.title,
        body: message.message.description,
        imageUrl: message.message.image,
        sound: message.message.sound,
      },
      data: {
        ...(message.dialogId
          ? { link: `autosaleapp://ScreenDialog/?dialogId=${message.dialogId}` }
          : {}),
        ...(message.link ? { link: message.link } : {}),
      },
    },
    apns: {
      payload: {
        aps: {
          badge: message.badge || undefined,
          sound: message.message.sound,
        },
        ...(message.dialogId
          ? { link: `autosaleapp://ScreenDialog/?dialogId=${message.dialogId}` }
          : {}),
        ...(message.link ? { link: message.link } : {}),
      },
    },
  });
}

import {
  InternalServerErrorException,
  NotFoundException,
} from "@force-dev/utils";
import axios from "axios";
import admin from "firebase-admin";
import { Message } from "firebase-admin/lib/messaging/messaging-api";
import fs from "fs";
import { inject, injectable } from "inversify";
import path from "path";

import { Injectable } from "../../core";
import { FcmTokenRepository } from "./fcm-token.repository";
import { ApnRegisterTokenResponse, FCMMessage } from "./fcm-token.types";

const BATCH_IMPORT_URL = "https://iid.googleapis.com/iid/v1:batchImport";

// Проверка существования firebaseAccount.json
const serviceAccountPath = path.join(process.cwd(), "firebaseAccount.json");
let firebaseAdmin: admin.app.App | null = null;
let firebaseCredential: admin.credential.Credential | null = null;

try {
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);

    firebaseCredential = admin.credential.cert(serviceAccount);
    firebaseAdmin = admin.initializeApp({
      credential: firebaseCredential,
    });
    console.log("Firebase Admin инициализирован успешно");
  } else {
    console.warn(
      "Файл firebaseAccount.json не найден. Firebase функции будут недоступны.",
    );
  }
} catch (error) {
  console.error("Ошибка инициализации Firebase Admin:", error);
}

@Injectable()
export class FcmTokenService {
  private _accessToken: string | undefined = undefined;
  private _fetch = axios.create({
    timeout: 2 * 60 * 1000,
    withCredentials: true,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: this._accessToken && `Bearer ${this._accessToken}`,
    },
  });

  constructor(
    @inject(FcmTokenRepository) private _fcmTokenRepository: FcmTokenRepository,
  ) {
    if (firebaseAdmin !== null && firebaseCredential !== null) {
      this.getAccessToken().then(token => {
        this._accessToken = token;
      });
    }
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

      return await this._fcmTokenRepository.create({
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
    return await this._fcmTokenRepository.deleteByUserId(userId);
  }

  async getAccessToken() {
    if (firebaseAdmin === null || firebaseCredential === null) {
      throw new InternalServerErrorException("Firebase не инициализирован.");
    }

    const token = await firebaseCredential.getAccessToken();

    return token.access_token;
  }

  async sendFcmMessage(message: FCMMessage): Promise<string> {
    if (firebaseAdmin === null || firebaseCredential === null) {
      throw new InternalServerErrorException("Firebase не инициализирован.");
    }

    try {
      return await firebaseAdmin!
        .messaging()
        .send(this._getMessagePayload(message));
    } catch (e) {
      throw new InternalServerErrorException("Failed to send FCM message", e);
    }
  }

  async getFcmToken(apnsToken: string) {
    if (firebaseAdmin === null || firebaseCredential === null) {
      console.warn("Firebase не инициализирован.");

      return;
    }

    try {
      const tokenData = await admin.auth().verifyIdToken(apnsToken);

      console.log("FCM-токен пользователя:", tokenData.fcmToken);

      return tokenData.fcmToken;
    } catch (error) {
      console.error("Ошибка получения FCM-токена:", error);
    }
  }

  async registerApnToken(
    apns_tokens: string[],
    application: string,
    sandbox: boolean,
  ) {
    if (firebaseAdmin === null || firebaseCredential === null) {
      throw new InternalServerErrorException("Firebase не инициализирован.");
    }

    const response = await this._fetch.post<ApnRegisterTokenResponse>(
      BATCH_IMPORT_URL,
      JSON.stringify({
        application,
        sandbox,
        apns_tokens,
      }),
    );

    return response.data;
  }

  private _getMessagePayload = (message: FCMMessage): Message => ({
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

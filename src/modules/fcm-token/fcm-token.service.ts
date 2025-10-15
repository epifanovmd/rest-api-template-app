import {
  InternalServerErrorException,
  NotFoundException,
} from "@force-dev/utils";
import axios from "axios";
import admin from "firebase-admin";
import { Message } from "firebase-admin/lib/messaging/messaging-api";
import fs from "fs";
import { injectable } from "inversify";
import path from "path";

import { FcmToken } from "./fcm-token.model";
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

@injectable()
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

  constructor() {
    if (firebaseAdmin !== null && firebaseCredential !== null) {
      this.getAccessToken().then(token => {
        this._accessToken = token;
      });
    }
  }

  getTokens = (userId: string) =>
    FcmToken.findAll({ where: { userId } }).then(result => {
      if (result === null) {
        return Promise.reject(new NotFoundException());
      }

      return result;
    });

  getToken = (id: number) =>
    FcmToken.findOne({ where: { id } }).then(result => {
      if (result === null) {
        return Promise.reject(new NotFoundException());
      }

      return result;
    });

  addToken = (userId: string, token: string) =>
    FcmToken.create({
      userId,
      token,
    })
      .then(result => {
        if (result === null) {
          return Promise.reject(new NotFoundException());
        }

        return result;
      })
      .catch(error => {
        if (error.name === "SequelizeUniqueConstraintError") {
          return FcmToken.findOne({ where: { token } }).then(result => {
            if (result === null) {
              return Promise.reject(new NotFoundException());
            }

            return result;
          });
        } else {
          return Promise.reject(
            new InternalServerErrorException(error.message, error),
          );
        }
      });

  deleteToken = (id: number) => FcmToken.destroy({ where: { id } });

  deleteTokens = (userId: string) => FcmToken.destroy({ where: { userId } });

  async getAccessToken() {
    if (firebaseAdmin === null || firebaseCredential === null) {
      throw new InternalServerErrorException("Firebase не инициализирован.");
    }

    const token = await firebaseCredential.getAccessToken();

    return token.access_token;
  }

  sendFcmMessage = (message: FCMMessage) =>
    new Promise<string>((resolve, reject) => {
      if (firebaseAdmin === null || firebaseCredential === null) {
        reject(
          new InternalServerErrorException("Firebase не инициализирован."),
        );

        return;
      }

      try {
        firebaseAdmin!
          .messaging()
          .send(this._getMessagePayload(message))
          .then(res => {
            resolve(res);
          })
          .catch(reject);
      } catch (e) {
        reject(e);
      }
    });

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

  registerApnToken = (
    apns_tokens: string[],
    application: string,
    sandbox: boolean,
  ) => {
    if (firebaseAdmin === null || firebaseCredential === null) {
      return Promise.reject(
        new InternalServerErrorException("Firebase не инициализирован."),
      );
    }

    return this._fetch.post<ApnRegisterTokenResponse>(
      BATCH_IMPORT_URL,
      JSON.stringify({
        application,
        sandbox,
        apns_tokens,
      }),
    );
  };

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

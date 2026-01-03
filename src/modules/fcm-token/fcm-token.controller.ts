import { inject, injectable } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";

import { getContextUser } from "../../common";
import { Injectable, sequelize } from "../../core";
import { KoaRequest } from "../../types/koa";
import { FcmTokenDto, FcmTokenRequest } from "./fcm-token.model";
import { FcmTokenService } from "./fcm-token.service";
import { FCMMessage } from "./fcm-token.types";

@Injectable()
@Tags("FCM")
@Route("api/fcm")
export class FcmTokenController extends Controller {
  constructor(
    @inject(FcmTokenService) private _fcmTokenService: FcmTokenService,
  ) {
    super();
  }

  /**
   * Регистрирует APN-токены (Apple Push Notification) для iOS-устройств.
   *
   * @summary Регистрация APN-токенов
   * @param body Объект, содержащий APN-токены, название приложения и флаг песочницы.
   * @returns Список зарегистрированных APN-токенов.
   */
  @Security("jwt")
  @Post("/register-apn-token")
  registerApn(
    @Body()
    body: {
      apns_tokens: string[]; // Список APN-токенов
      application: string; // Название приложения
      sandbox: boolean; // Флаг песочницы (true - тестовый режим)
    },
  ): Promise<string[]> {
    return this._fcmTokenService
      .registerApnToken(body.apns_tokens, body.application, body.sandbox)
      .then(res =>
        (res.data?.results ?? []).map(item => item.registration_token),
      );
  }

  /**
   * Отправляет push-уведомление через Firebase Cloud Messaging (FCM).
   *
   * @summary Отправка push-уведомления
   * @param message Данные уведомления.
   * @returns ID отправленного уведомления.
   */
  @Security("jwt")
  @Post("/push")
  sendPushNotification(
    @Body()
    message: FCMMessage,
  ): Promise<string> {
    return this._fcmTokenService.sendFcmMessage(message);
  }

  /**
   * Получает все FCM-токены пользователя по его `userId`.
   *
   * @summary Получение токенов по `userId`
   * @param userId ID профиля пользователя.
   * @returns Список токенов, зарегистрированных за этим профилем.
   */
  @Security("jwt")
  @Get("/tokens")
  getTokens(@Query("userId") userId: string): Promise<FcmTokenDto[]> {
    return this._fcmTokenService.getTokens(userId);
  }

  /**
   * Получает все FCM-токены текущего аутентифицированного пользователя.
   *
   * @summary Получение токенов текущего пользователя
   * @param req Запрос с JWT-токеном.
   * @returns Список FCM-токенов пользователя.
   */
  @Security("jwt")
  @Get("/my-tokens")
  getMyTokens(@Request() req: KoaRequest): Promise<FcmTokenDto[]> {
    const user = getContextUser(req);

    return this._fcmTokenService.getTokens(user.id);
  }

  /**
   * Удаляет все FCM-токены текущего пользователя.
   *
   * @summary Удаление всех токенов пользователя
   * @param req Запрос с JWT-токеном.
   * @returns Количество удалённых токенов.
   */
  @Security("jwt")
  @Delete("/my-tokens")
  deleteTokens(@Request() req: KoaRequest): Promise<number> {
    const user = getContextUser(req);

    return this._fcmTokenService.deleteTokens(user.id);
  }

  /**
   * Получает FCM-токен по его ID.
   *
   * @summary Получение токена по `id`
   * @param id Уникальный идентификатор токена.
   * @returns Объект FCM-токена.
   */
  @Security("jwt")
  @Get("/token/{id}")
  getToken(@Path() id: number): Promise<FcmTokenDto> {
    return this._fcmTokenService.getToken(id);
  }

  /**
   * Добавляет новый FCM-токен для текущего пользователя.
   *
   * @summary Добавление FCM-токена
   * @param req Запрос с JWT-токеном.
   * @param token FCM-токен для регистрации.
   * @returns Зарегистрированный FCM-токен.
   */
  @Security("jwt")
  @Post("/token")
  addToken(
    @Request() req: KoaRequest,
    @Body() { token }: FcmTokenRequest,
  ): Promise<FcmTokenDto> {
    const user = getContextUser(req);

    return this._fcmTokenService.addToken(user.id, token);
  }

  /**
   * Удаляет FCM-токен по его `id`.
   *
   * @summary Удаление токена
   * @param id Уникальный идентификатор токена.
   * @returns Количество удалённых записей (1 или 0).
   */
  @Security("jwt")
  @Delete("/token/{id}")
  deleteToken(@Path() id: number): Promise<number> {
    return this._fcmTokenService.deleteToken(id);
  }
}

import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";

import { getContextUser, Injectable, ValidateBody } from "../../core";
import { KoaRequest } from "../../types/koa";
import { KeyBundleDto } from "./dto/encryption.dto";
import { EncryptionService } from "./encryption.service";
import { UploadKeysSchema, UploadPreKeysSchema } from "./validation/upload-keys.validate";

interface IUploadKeysBody {
  deviceId: string;
  identityKey: string;
  signedPreKey: { id: number; publicKey: string; signature: string };
  oneTimePreKeys: { id: number; publicKey: string }[];
}

interface IUploadPreKeysBody {
  keys: { id: number; publicKey: string }[];
}

@Injectable()
@Tags("Encryption")
@Route("api/encryption")
export class EncryptionController extends Controller {
  constructor(
    @inject(EncryptionService) private _encService: EncryptionService,
  ) {
    super();
  }

  /**
   * Загрузить ключи устройства (identity + signed prekey + one-time prekeys).
   * @summary Загрузка ключей
   */
  @Security("jwt")
  @ValidateBody(UploadKeysSchema)
  @Post("keys")
  async uploadKeys(
    @Request() req: KoaRequest,
    @Body() body: IUploadKeysBody,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._encService.uploadKeys(user.userId, body);
  }

  /**
   * Получить key bundle пользователя для установки E2E сессии.
   * @summary Получение key bundle
   */
  @Security("jwt")
  @Get("keys/{userId}")
  getKeyBundle(@Path() userId: string): Promise<KeyBundleDto> {
    return this._encService.getKeyBundle(userId);
  }

  /**
   * Загрузить дополнительные one-time prekeys.
   * @summary Загрузка prekeys
   */
  @Security("jwt")
  @ValidateBody(UploadPreKeysSchema)
  @Post("keys/prekeys")
  async uploadPreKeys(
    @Request() req: KoaRequest,
    @Body() body: IUploadPreKeysBody,
  ): Promise<{ availableCount: number }> {
    const user = getContextUser(req);
    const count = await this._encService.uploadPreKeys(
      user.userId,
      body.keys,
    );

    return { availableCount: count };
  }

  /**
   * Отозвать ключи устройства.
   * @summary Отзыв ключей устройства
   */
  @Security("jwt")
  @Delete("keys/{deviceId}")
  async revokeDevice(
    @Request() req: KoaRequest,
    @Path() deviceId: string,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._encService.revokeDevice(user.userId, deviceId);
  }
}

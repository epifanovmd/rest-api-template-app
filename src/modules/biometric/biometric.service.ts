import { InternalServerErrorException } from "@force-dev/utils";
import { createVerify, randomBytes } from "crypto";
import { inject, injectable } from "inversify";

import { AuthService } from "../auth";
import { UserService } from "../user";
import { Biometric } from "./biometric.model";

@injectable()
export class BiometricService {
  constructor(
    @inject(UserService) private _userService: UserService,
    @inject(AuthService) private _authService: AuthService,
  ) {}

  /**
   * Регистрация биометрического ключа
   */
  async registerBiometric(
    userId: string,
    deviceId: string,
    deviceName: string,
    publicKey: string,
  ) {
    const user = await this._userService.getUser(userId);

    await Biometric.upsert({
      userId: user.id,
      deviceId,
      deviceName,
      publicKey,
      lastUsedAt: new Date(),
    });
  }

  /**
   * Генерация nonce для входа
   */
  async generateNonce(userId: string) {
    const user = await this._userService.getUser(userId);
    const nonce = randomBytes(32).toString("base64url");

    user.challenge = nonce;
    await user.save();

    return { nonce };
  }

  /**
   * Проверка подписи и выдача токенов
   */
  async verifyBiometricSignature(
    userId: string,
    deviceId: string,
    signature: string,
  ) {
    const user = await this._userService.getUser(userId);
    const biometric = await Biometric.findOne({
      where: { userId, deviceId },
    });

    if (!user?.challenge) {
      throw new InternalServerErrorException("Challenge not found");
    }

    if (!biometric) {
      throw new InternalServerErrorException("Biometric not registered");
    }

    const isValid = this._verifySignature({
      publicKey: biometric.publicKey,
      message: user.challenge,
      signature,
    });

    if (!isValid) {
      throw new InternalServerErrorException("Invalid biometric signature");
    }

    biometric.lastUsedAt = new Date();
    await biometric.save();

    return {
      verified: true,
      tokens: await this._authService.getTokens(userId),
    };
  }

  /**
   * Проверка подписи (на основе SHA256 и ECDSA)
   */
  private _verifySignature({
    publicKey,
    message,
    signature,
  }: {
    publicKey: string;
    message: string;
    signature: string;
  }) {
    const verifier = createVerify("SHA256");

    verifier.update(message);
    verifier.end();

    const publicKeyPem = this._convertPublicKeyToPEM(publicKey);
    const signatureBuf = Buffer.from(signature, "base64");

    try {
      return verifier.verify(publicKeyPem, signatureBuf);
    } catch {
      return false;
    }
  }

  /**
   * Конвертирует base64 publicKey → PEM
   */
  private _convertPublicKeyToPEM(base64Key: string): string {
    const keyBuffer = Buffer.from(base64Key, "base64");
    const base64Pem = keyBuffer
      .toString("base64")
      .match(/.{1,64}/g)
      ?.join("\n");

    return `-----BEGIN PUBLIC KEY-----\n${base64Pem}\n-----END PUBLIC KEY-----`;
  }
}

import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from "@force-dev/utils";
import { createVerify, randomBytes } from "crypto";
import { inject } from "inversify";

import { Injectable, TokenService } from "../../core";
import { UserService } from "../user";
import { BiometricRepository } from "./biometric.repository";

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 минут
const MAX_DEVICES_PER_USER = 5;

@Injectable()
export class BiometricService {
  constructor(
    @inject(UserService) private _userService: UserService,
    @inject(TokenService) private _tokenService: TokenService,
    @inject(BiometricRepository)
    private _biometricRepository: BiometricRepository,
  ) {}

  async registerBiometric(
    userId: string,
    deviceId: string,
    deviceName: string,
    publicKey: string,
  ) {
    const existing =
      await this._biometricRepository.findByUserIdAndDeviceId(userId, deviceId);

    if (existing) {
      existing.publicKey = publicKey;
      existing.deviceName = deviceName;
      existing.lastUsedAt = new Date();
      await this._biometricRepository.save(existing);
    } else {
      const count = await this._biometricRepository.countByUserId(userId);

      if (count >= MAX_DEVICES_PER_USER) {
        throw new ConflictException(
          `Достигнут лимит устройств (макс. ${MAX_DEVICES_PER_USER})`,
        );
      }

      await this._biometricRepository.createAndSave({
        userId,
        deviceId,
        deviceName,
        publicKey,
        lastUsedAt: new Date(),
      });
    }
  }

  async generateNonce(userId: string, deviceId: string) {
    const biometric =
      await this._biometricRepository.findByUserIdAndDeviceId(userId, deviceId);

    if (!biometric) {
      throw new NotFoundException("Биометрия не зарегистрирована для этого устройства");
    }

    const nonce = randomBytes(32).toString("base64url");

    biometric.challenge = nonce;
    biometric.challengeExpiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    await this._biometricRepository.save(biometric);

    return { nonce };
  }

  async verifyBiometricSignature(
    userId: string,
    deviceId: string,
    signature: string,
  ) {
    const biometric =
      await this._biometricRepository.findByUserIdAndDeviceId(userId, deviceId);

    if (!biometric) {
      throw new NotFoundException("Биометрия не зарегистрирована");
    }

    if (!biometric.challenge) {
      throw new InternalServerErrorException(
        "Challenge не найден. Сначала вызовите generate-nonce.",
      );
    }

    if (
      !biometric.challengeExpiresAt ||
      biometric.challengeExpiresAt < new Date()
    ) {
      biometric.challenge = null;
      biometric.challengeExpiresAt = null;
      await this._biometricRepository.save(biometric);
      throw new InternalServerErrorException("Challenge истёк");
    }

    const isValid = this._verifySignature({
      publicKey: biometric.publicKey,
      message: biometric.challenge,
      signature,
    });

    if (!isValid) {
      throw new InternalServerErrorException("Неверная биометрическая подпись");
    }

    // Инвалидируем challenge после успешной проверки
    biometric.challenge = null;
    biometric.challengeExpiresAt = null;
    biometric.lastUsedAt = new Date();
    await this._biometricRepository.save(biometric);

    const user = await this._userService.getUser(userId);

    return {
      verified: true,
      tokens: await this._tokenService.issue(user),
    };
  }

  async getDevices(userId: string) {
    return this._biometricRepository.findByUserId(userId);
  }

  async deleteDevice(userId: string, deviceId: string) {
    const result =
      await this._biometricRepository.deleteByUserIdAndDeviceId(userId, deviceId);

    if (!result.affected) {
      throw new NotFoundException("Устройство не найдено");
    }

    return { deleted: true };
  }

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

  private _convertPublicKeyToPEM(base64Key: string): string {
    const keyBuffer = Buffer.from(base64Key, "base64");
    const base64Pem = keyBuffer
      .toString("base64")
      .match(/.{1,64}/g)
      ?.join("\n");

    return `-----BEGIN PUBLIC KEY-----\n${base64Pem}\n-----END PUBLIC KEY-----`;
  }
}

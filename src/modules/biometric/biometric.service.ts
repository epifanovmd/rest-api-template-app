import { InternalServerErrorException } from "@force-dev/utils";
import { createVerify, randomBytes } from "crypto";
import { inject, injectable } from "inversify";

import { Injectable } from "../../core";
import { AuthService } from "../auth";
import { UserService } from "../user";
import { BiometricRepository } from "./biometric.repository";

@Injectable()
export class BiometricService {
  constructor(
    @inject(UserService) private _userService: UserService,
    @inject(AuthService) private _authService: AuthService,
    @inject(BiometricRepository)
    private _biometricRepository: BiometricRepository,
  ) {}

  async registerBiometric(
    userId: string,
    deviceId: string,
    deviceName: string,
    publicKey: string,
  ) {
    await this._biometricRepository.upsert({
      userId,
      deviceId,
      deviceName,
      publicKey,
      lastUsedAt: new Date(),
    });
  }

  async generateNonce(userId: string) {
    const user = await this._userService.getUser(userId);
    const nonce = randomBytes(32).toString("base64url");

    await this._userService.updateUser(user.id, { challenge: nonce });

    return { nonce };
  }

  async verifyBiometricSignature(
    userId: string,
    deviceId: string,
    signature: string,
  ) {
    const user = await this._userService.getUser(userId);
    const biometric = await this._biometricRepository.findByUserIdAndDeviceId(
      userId,
      deviceId,
    );

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
    await this._biometricRepository.save(biometric);

    return {
      verified: true,
      tokens: await this._authService.getTokens(userId),
    };
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

import { InternalServerErrorException, NotFoundException } from "@force-dev/utils";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";
import { inject } from "inversify";

import { config } from "../../config";
import { Injectable } from "../../core";
import { SessionService } from "../session/session.service";
import { UserService } from "../user";
import { PasskeyChallengeRepository } from "./passkey-challenge.repository";
import { PasskeysRepository } from "./passkeys.repository";

const { webAuthn } = config.auth;
const rpName = webAuthn.rpName;
const rpID = webAuthn.rpHost;
const port = webAuthn.rpPort ? `:${webAuthn.rpPort}` : "";
const origin = `${webAuthn.rpSchema}://${rpID}${port}`;

/** Сервис для регистрации и аутентификации через WebAuthn passkeys. */
@Injectable()
export class PasskeysService {
  constructor(
    @inject(UserService) private _userService: UserService,
    @inject(PasskeysRepository) private _passkeysRepository: PasskeysRepository,
    @inject(PasskeyChallengeRepository) private _challengeRepo: PasskeyChallengeRepository,
    @inject(SessionService) private _sessionService: SessionService,
  ) {}

  /**
   * Генерирует параметры для регистрации passkey.
   * Вызывается авторизованным пользователем.
   */
  async generateRegistrationOptions(userId: string) {
    const user = await this._userService.getUser(userId);
    const userName = user.email || user.phone;

    if (!userName) {
      throw new InternalServerErrorException(
        "У пользователя отсутствует email и телефон",
      );
    }

    const existingPasskeys = await this._passkeysRepository.findByUserId(userId);
    const userIdBuffer = Buffer.from(user.id, "utf-8");

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: userIdBuffer,
      userName,
      userDisplayName: userName,
      attestationType: "none",
      excludeCredentials: existingPasskeys.map(p => ({
        id: p.id,
        transports: p.transports,
      })),
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        requireResidentKey: false,
        residentKey: "discouraged",
      },
      timeout: 60000,
    });

    await this._challengeRepo.createChallenge(user.id, options.challenge);

    return options;
  }

  /**
   * Верифицирует ответ регистрации и сохраняет passkey.
   * Вызывается авторизованным пользователем.
   */
  async verifyRegistration(userId: string, data: RegistrationResponseJSON) {
    const challengeRecord = await this._challengeRepo.findValidChallenge(userId);

    if (!challengeRecord) {
      throw new InternalServerErrorException(
        "Challenge не найден или истёк. Сначала вызовите generate-registration-options.",
      );
    }

    let verification;

    try {
      verification = await verifyRegistrationResponse({
        response: data,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      });
    } catch (error) {
      throw new InternalServerErrorException("Ошибка верификации регистрации", error);
    }

    if (verification.verified && verification.registrationInfo) {
      const { credential, credentialDeviceType } = verification.registrationInfo;

      await this._passkeysRepository.createAndSave({
        id: credential.id,
        publicKey: new Uint8Array(credential.publicKey),
        userId,
        counter: credential.counter,
        deviceType: credentialDeviceType,
        transports: credential.transports,
      });

      await this._challengeRepo.deleteByUserId(userId);
    }

    return { verified: verification.verified };
  }

  /**
   * Генерирует параметры для аутентификации по passkey.
   * Принимает login (email или телефон) для поиска пользователя.
   */
  async generateAuthenticationOptions(login: string) {
    let user;

    try {
      if (login.includes("@")) {
        user = await this._userService.getUserByAttr({ email: login });
      } else {
        user = await this._userService.getUserByAttr({ phone: login });
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        // Не раскрываем, существует ли пользователь
        throw new NotFoundException("Passkey не найден");
      }
      throw error;
    }

    const passkeys = await this._passkeysRepository.findByUserId(user.id);

    if (!passkeys.length) {
      throw new NotFoundException("Passkey не найден");
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: passkeys.map(p => ({
        id: p.id,
        transports: p.transports,
      })),
      timeout: 60000,
    });

    await this._challengeRepo.createChallenge(user.id, options.challenge);

    return options;
  }

  /**
   * Верифицирует ответ аутентификации и возвращает токены.
   * Находит пользователя и passkey по credential ID из ответа.
   */
  async verifyAuthentication(data: AuthenticationResponseJSON) {
    const passkey = await this._passkeysRepository.findById(data.id);

    if (!passkey) {
      throw new NotFoundException(`Passkey ${data.id} не найден`);
    }

    const user = await this._userService.getUser(passkey.userId);
    const challengeRecord = await this._challengeRepo.findValidChallenge(user.id);

    if (!challengeRecord) {
      throw new InternalServerErrorException(
        "Challenge не найден или истёк. Сначала вызовите generate-authentication-options.",
      );
    }

    let verifyData;

    try {
      verifyData = await verifyAuthenticationResponse({
        response: data,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: passkey.id,
          publicKey: passkey.publicKey,
          counter: passkey.counter,
          transports: passkey.transports,
        },
      });
    } catch (error) {
      throw new InternalServerErrorException("Ошибка верификации аутентификации", error);
    }

    if (verifyData.verified) {
      passkey.counter = verifyData.authenticationInfo.newCounter;
      passkey.lastUsed = new Date();
      await this._passkeysRepository.save(passkey);

      await this._challengeRepo.deleteByUserId(user.id);
    }

    let tokens;

    if (verifyData.verified) {
      const result = await this._sessionService.createAuthenticatedSession(
        user,
        { deviceName: "passkey" },
      );

      tokens = result.tokens;
    }

    return {
      verified: verifyData.verified,
      tokens,
    };
  }
}

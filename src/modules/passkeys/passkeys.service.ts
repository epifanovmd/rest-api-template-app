import { InternalServerErrorException } from "@force-dev/utils";
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
import { inject, injectable } from "inversify";

import { config } from "../../../config";
import { AuthService } from "../auth";
import { UserService } from "../user";
import {
  IVerifyAuthenticationResponse,
  IVerifyRegistrationResponse,
  Passkeys,
} from "./passkeys.model";

const {
  WEB_AUTHN_RP_NAME,
  WEB_AUTHN_RP_HOST,
  WEB_AUTHN_RP_SCHEMA,
  WEB_AUTHN_RP_PORT,
} = config;

const schema = WEB_AUTHN_RP_SCHEMA;
const port = WEB_AUTHN_RP_PORT ? `:${WEB_AUTHN_RP_PORT}` : "";

const rpName = WEB_AUTHN_RP_NAME;
const rpID = WEB_AUTHN_RP_HOST;
const origin = `${schema}://${rpID}${port}`;

@injectable()
export class PasskeysService {
  constructor(
    @inject(UserService) private _userService: UserService,
    @inject(AuthService) private _authService: AuthService,
  ) {}

  async generateRegistrationOptions(userId: string) {
    // Проверьте, существует ли пользователь с данным ID
    const user = await this._userService.getUser(userId);
    // Настройте параметры для генерации
    const userDisplayName = user.email || user.phone;
    const userName = user.email || user.phone;
    const userIdBuffer = Buffer.from(user.id, "utf-8");
    const passkeys = await user.getPasskeys();

    if (!userName) {
      throw new InternalServerErrorException(
        "У пользователя отсутсвует и email и телефон",
      );
    }

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: userIdBuffer,
      userName,
      userDisplayName,
      attestationType: "none", // или 'indirect', 'direct' в зависимости от ваших требований
      excludeCredentials: passkeys.map(passkey => ({
        id: passkey.id,
        // Optional
        transports: passkey.transports,
      })),
      authenticatorSelection: {
        authenticatorAttachment: "platform", // или 'cross-platform'
        requireResidentKey: false,
        residentKey: "discouraged",
      },
      timeout: 60000, // Таймаут в миллисекундах
    });

    user.challenge = options.challenge;
    await user.save();

    // Генерация опций для регистрации
    return options;
  }

  verifyRegistration = async (
    userId: string,
    data: RegistrationResponseJSON,
  ): Promise<IVerifyRegistrationResponse> => {
    try {
      const user = await this._userService.getUser(userId);

      if (user.challenge) {
        // Проверьте данные с помощью verifyRegistrationResponse
        const verification = await verifyRegistrationResponse({
          response: data,
          expectedChallenge: user.challenge, // Укажите ожидаемый challenge
          expectedOrigin: origin, // Укажите ваш origin
          expectedRPID: rpID, // Укажите ваш RPID
        });

        if (verification.verified && verification.registrationInfo) {
          // Сохраните данные в модель Passkeys
          await Passkeys.create({
            id: verification.registrationInfo.credential.id,
            publicKey: Buffer.from(
              verification.registrationInfo.credential.publicKey,
            ),
            userId: userId,
            counter: verification.registrationInfo.credential.counter,
            deviceType: verification.registrationInfo.credentialDeviceType,
            transports: verification.registrationInfo.credential.transports,
          });
        }

        return {
          verified: verification.verified,
        };
      }

      return Promise.reject(
        new InternalServerErrorException("Challenge not found"),
      );
    } catch (error) {
      throw new InternalServerErrorException("Ошибка верификации", error);
    }
  };

  async generateAuthenticationOptions(userId: string) {
    const user = await this._userService.getUser(userId);
    const passkeys = await user.getPasskeys();

    if (!passkeys || passkeys.length === 0) {
      throw new InternalServerErrorException("Credentials not found");
    }

    const options = await generateAuthenticationOptions({
      rpID,
      // Require users to use a previously-registered authenticator
      allowCredentials: passkeys.map(passkey => ({
        id: passkey.id,
        transports: passkey.transports,
      })),
    });

    user.challenge = options.challenge;
    await user.save();

    return options;
  }

  async verifyAuthentication(
    userId: string,
    data: AuthenticationResponseJSON,
  ): Promise<IVerifyAuthenticationResponse> {
    // Логика верификации аутентификации
    const user = await this._userService.getUser(userId);

    const passkey = await Passkeys.findOne({
      where: {
        userId,
        id: data.id,
      },
    });

    if (!user.challenge) {
      throw new InternalServerErrorException(
        `Could not find challenge for user ${userId}`,
      );
    }

    if (!passkey) {
      throw new InternalServerErrorException(
        `Could not find passkey ${data.id} for user ${userId}`,
      );
    }

    const verifyData = await verifyAuthenticationResponse({
      response: data,
      expectedChallenge: user.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports,
      },
    });

    if (verifyData.verified) {
      passkey.counter = verifyData.authenticationInfo.newCounter;
      await passkey.save();
    }

    return {
      verified: verifyData.verified,
      tokens: await this._authService.getTokens(userId),
    };
  }
}

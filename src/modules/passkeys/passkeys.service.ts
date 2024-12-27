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
import { ProfileService } from "../profile";
import {
  IVerifyAuthenticationResponse,
  IVerifyRegistrationResponse,
  Passkeys,
} from "./passkeys.model";

const { WEB_AUTHN_RP_NAME, WEB_AUTHN_RP_ID, WEB_AUTHN_RP_SCHEMA } = config;

const rpName = WEB_AUTHN_RP_NAME;
const rpID = WEB_AUTHN_RP_ID;
const origin = `${WEB_AUTHN_RP_SCHEMA}://${rpID}`;

@injectable()
export class PasskeysService {
  constructor(
    @inject(ProfileService) private _profileService: ProfileService,
    @inject(AuthService) private _authService: AuthService,
  ) {}

  async generateRegistrationOptions(profileId: string) {
    // Проверьте, существует ли профиль с данным ID
    const profile = await this._profileService.getProfile(profileId);
    // Настройте параметры для генерации
    const userDisplayName = profile.email || profile.phone;
    const userName = profile.email || profile.phone;
    const userIdBuffer = Buffer.from(profile.id, "utf-8");
    const passkeys = await profile.getPasskeys();

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

    profile.challenge = options.challenge;
    await profile.save();

    // Генерация опций для регистрации
    return options;
  }

  verifyRegistration = async (
    profileId: string,
    data: RegistrationResponseJSON,
  ): Promise<IVerifyRegistrationResponse> => {
    try {
      const profile = await this._profileService.getProfile(profileId);

      if (profile.challenge) {
        // Проверьте данные с помощью verifyRegistrationResponse
        const verification = await verifyRegistrationResponse({
          response: data,
          expectedChallenge: profile.challenge, // Укажите ожидаемый challenge
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
            profileId: profileId,
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

  async generateAuthenticationOptions(profileId: string) {
    const profile = await this._profileService.getProfile(profileId);
    const passkeys = await profile.getPasskeys();

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

    profile.challenge = options.challenge;
    await profile.save();

    return options;
  }

  async verifyAuthentication(
    profileId: string,
    data: AuthenticationResponseJSON,
  ): Promise<IVerifyAuthenticationResponse> {
    // Логика верификации аутентификации
    const profile = await this._profileService.getProfile(profileId);

    const passkey = await Passkeys.findOne({
      where: {
        profileId,
        id: data.id,
      },
    });

    if (!profile.challenge) {
      throw new InternalServerErrorException(
        `Could not find challenge for user ${profileId}`,
      );
    }

    if (!passkey) {
      throw new InternalServerErrorException(
        `Could not find passkey ${data.id} for user ${profileId}`,
      );
    }

    const verifyData = await verifyAuthenticationResponse({
      response: data,
      expectedChallenge: profile.challenge,
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
      tokens: await this._authService.getTokens(profileId),
    };
  }
}

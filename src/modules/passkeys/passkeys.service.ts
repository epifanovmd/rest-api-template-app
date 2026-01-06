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
import { inject } from "inversify";

import { config } from "../../../config";
import { Injectable } from "../../core";
import { AuthService } from "../auth";
import { UserService } from "../user";
import { PasskeyRepository } from "./passkeys.repository";

const {
  auth: { webAuthn },
} = config;

const schema = webAuthn.rpSchema;
const port = webAuthn.rpPort ? `:${webAuthn.rpPort}` : "";

const rpName = webAuthn.rpName;
const rpID = webAuthn.rpHost;
const origin = `${schema}://${rpID}${port}`;

@Injectable()
export class PasskeysService {
  constructor(
    @inject(UserService) private _userService: UserService,
    @inject(AuthService) private _authService: AuthService,
    @inject(PasskeyRepository) private _passkeyRepository: PasskeyRepository,
  ) {}

  async generateRegistrationOptions(userId: string) {
    const user = await this._userService.getUser(userId);
    const userDisplayName = user.email || user.phone;
    const userName = user.email || user.phone;

    if (!userName) {
      throw new InternalServerErrorException(
        "У пользователя отсутствует и email и телефон",
      );
    }

    const passkeys = await this._passkeyRepository.findByUserId(userId);
    const userIdBuffer = Buffer.from(user.id, "utf-8");

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: userIdBuffer,
      userName,
      userDisplayName,
      attestationType: "none",
      excludeCredentials: passkeys.map(passkey => ({
        id: passkey.id,
        transports: passkey.transports,
      })),
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        requireResidentKey: false,
        residentKey: "discouraged",
      },
      timeout: 60000,
    });

    user.challenge = options.challenge;
    await this._userService.updateUser(user.id, {
      challenge: options.challenge,
    });

    return options;
  }

  async verifyRegistration(userId: string, data: RegistrationResponseJSON) {
    try {
      const user = await this._userService.getUser(userId);

      if (!user.challenge) {
        throw new InternalServerErrorException("Challenge not found");
      }

      const verification = await verifyRegistrationResponse({
        response: data,
        expectedChallenge: user.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      });

      if (verification.verified && verification.registrationInfo) {
        await this._passkeyRepository.createAndSave({
          id: verification.registrationInfo.credential.id,
          publicKey: new Uint8Array(
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
    } catch (error) {
      throw new InternalServerErrorException("Ошибка верификации", error);
    }
  }

  async generateAuthenticationOptions(userId: string) {
    const user = await this._userService.getUser(userId);
    const passkeys = await this._passkeyRepository.findByUserId(userId);

    if (!passkeys || passkeys.length === 0) {
      throw new InternalServerErrorException("Credentials not found");
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: passkeys.map(passkey => ({
        id: passkey.id,
        transports: passkey.transports,
      })),
    });

    user.challenge = options.challenge;
    await this._userService.updateUser(user.id, {
      // challenge: options.challenge,
    });

    return options;
  }

  async verifyAuthentication(userId: string, data: AuthenticationResponseJSON) {
    const user = await this._userService.getUser(userId);
    const passkey = await this._passkeyRepository.findByUserIdAndId(
      userId,
      data.id,
    );

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
        publicKey: passkey.publicKey,
        counter: passkey.counter,
        transports: passkey.transports,
      },
    });

    if (verifyData.verified) {
      passkey.counter = verifyData.authenticationInfo.newCounter;
      await this._passkeyRepository.save(passkey);
    }

    return {
      verified: verifyData.verified,
      tokens: await this._authService.getTokens(userId),
    };
  }
}

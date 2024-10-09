import { BadRequestException, UnauthorizedException } from "@force-dev/utils";
import { inject, injectable } from "inversify";
import sha256 from "sha256";

import { createTokenAsync, verifyToken } from "../../common";
import { ProfileService } from "../profile";
import {
  IProfileWithTokensDto,
  ISignInRequest,
  ISignUpRequest,
  ITokensDto,
} from "./auth.types";

@injectable()
export class AuthService {
  constructor(
    @inject(ProfileService) private _profileService: ProfileService,
  ) {}

  async signUp({
    username,
    password,
    ...rest
  }: ISignUpRequest): Promise<IProfileWithTokensDto> {
    const client = await this._profileService
      .getProfileByAttr({
        username,
      })
      .catch(() => null);

    if (client) {
      throw new BadRequestException(
        `Клиент с логином - ${username}, уже зарегистрирован`,
      );
    } else {
      return this._profileService
        .createProfile({
          ...rest,
          username,
          passwordHash: sha256(password),
        })
        .then(() =>
          this.signIn({
            username,
            password,
          }),
        );
    }
  }

  async signIn(body: ISignInRequest): Promise<IProfileWithTokensDto> {
    const { username, password } = body;

    try {
      const { id, passwordHash } = await this._profileService.getProfileByAttr({
        username,
      });

      if (passwordHash === sha256(password)) {
        const profile = await this._profileService.getProfile(id);

        const role = profile.role;

        const data = {
          ...profile.toJSON(),
          role,
        };

        return {
          ...data,
          tokens: await this.getTokens(data.id),
        };
      }
    } catch {
      /* empty */
    }

    throw new UnauthorizedException("Не верный логин или пароль");
  }

  async updateTokens(token?: string) {
    const profile = await verifyToken(token);

    return this.getTokens(profile.id);
  }

  async getTokens(profileId: string): Promise<ITokensDto> {
    const [accessToken, refreshToken] = await createTokenAsync([
      {
        profileId,
        opts: { expiresIn: "15m" },
      },
      {
        profileId,
        opts: { expiresIn: "7d" },
      },
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}

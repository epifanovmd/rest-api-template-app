import { inject, injectable } from "inversify";
import sha256 from "sha256";
import { v4 } from "uuid";

import { ApiError } from "../../common";
import { createTokenAsync, verifyToken } from "../../common/helpers";
import { IProfileDto, ProfileService } from "../profile";
import {
  IProfileWithTokensDto,
  ISignInRequestDto,
  ISignUpRequestDto,
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
  }: ISignUpRequestDto): Promise<IProfileWithTokensDto> {
    const client = await this._profileService
      .getProfileByAttr({
        username,
      })
      .catch(() => null);

    if (client) {
      throw new ApiError(
        `Клиент с логином - ${username}, уже зарегистрирован`,
        500,
      );
    } else {
      return this._profileService
        .createProfile({
          id: v4(),
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

  async signIn(body: ISignInRequestDto): Promise<IProfileWithTokensDto> {
    const { username, password } = body;

    const { id, passwordHash } = await this._profileService.getProfileByAttr({
      username,
    });

    if (passwordHash === sha256(password)) {
      const profile = (await this._profileService.getProfile(id)).toJSON();

      return {
        ...profile,
        tokens: await this.getTokens(profile),
      };
    }

    throw new ApiError("Неверный логин или пароль", 500);
  }

  async updateTokens(token?: string) {
    const { iat, exp, ...profile } = await verifyToken(token);

    return this.getTokens(profile);
  }

  async getTokens(profile: IProfileDto): Promise<ITokensDto> {
    const [accessToken, refreshToken] = await createTokenAsync([
      {
        profile,
        opts: { expiresIn: "15m" },
      },
      {
        profile,
        opts: { expiresIn: "7d" },
      },
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}

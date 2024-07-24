import { inject as Inject, injectable as Injectable } from "inversify";
import sha256 from "sha256";
import { v4 } from "uuid";

import { ApiError } from "../../common";
import { createTokenAsync, verifyToken } from "../../common/helpers";
import { RedisService } from "../redis";
import {
  IProfileDto,
  IProfileModel,
  IProfileWithTokensDto,
  ISignInRequestDto,
  ISignUpRequestDto,
} from "./auth.types";

@Injectable()
export class AuthService {
  constructor(@Inject(RedisService) private _redisService: RedisService) {}

  async signUp(body: ISignUpRequestDto): Promise<IProfileWithTokensDto> {
    const client = await this._getProfile(body.username);

    if (client) {
      throw new ApiError(
        `Клиент с логином - ${body.username}, уже зарегистрирован`,
        500,
      );
    } else {
      return this._setProfile(body.username, {
        id: v4(),
        username: body.username,
        name: body.name,
        password: sha256(body.password),
      }).then(() =>
        this.signIn({
          username: body.username,
          password: body.password,
        }),
      );
    }
  }

  async signIn(body: ISignInRequestDto): Promise<IProfileWithTokensDto> {
    const client = await this._getProfile(body.username);

    if (client) {
      const { password, ...rest } = client;

      if (password === sha256(body.password)) {
        return {
          ...rest,
          tokens: await this.getTokens(rest),
        };
      }
    }

    throw new ApiError("Неверный логин или пароль", 500);
  }

  async updateTokens(token?: string) {
    const { iat, exp, ...profile } = await verifyToken(token);

    return this.getTokens(profile);
  }

  async getTokens(profile: IProfileDto) {
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

  private _getProfile(username: string): Promise<IProfileModel | null> {
    return this._redisService.get<IProfileModel>(username);
  }

  private _setProfile(username: string, body: IProfileModel) {
    return this._redisService.set(username, body).catch(() => {
      throw new ApiError("Клиент не найден в базе данных", 500);
    });
  }
}

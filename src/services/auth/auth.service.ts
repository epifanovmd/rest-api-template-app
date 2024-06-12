import { inject as Inject, injectable as Injectable } from "inversify";
import sha256 from "sha256";
import { v4 } from "uuid";
import { ApiError } from "../../common";
import { createTokenAsync, verifyToken } from "../../common/helpers";
import { RedisService } from "../redis";
import {
  AuthDto,
  CreateProfileDto,
  PrivateProfile,
  Profile,
  ProfileDto,
} from "./auth.types";

@Injectable()
export class AuthService {
  constructor(@Inject(RedisService) private _redisService: RedisService) {}

  async signUp(body: CreateProfileDto): Promise<ProfileDto> {
    const client = await this._getProfile(body.username);

    if (client) {
      throw new ApiError(
        `Клиент с логином - ${body.username}, уже зарегистрирован`,
        500,
      );
    } else {
      const salt = v4();

      return this._setProfile(body.username, {
        id: v4(),
        username: body.username,
        name: body.name,
        password: sha256(body.password + salt),
        salt,
      }).then(() =>
        this.signIn({
          username: body.username,
          password: body.password,
        }),
      );
    }
  }

  async signIn(body: AuthDto): Promise<ProfileDto> {
    const client = await this._getProfile(body.username);

    if (client) {
      const { password, salt, ...rest } = client;

      if (password === sha256(body.password + salt)) {
        return {
          ...rest,
          tokens: await this.getTokens(rest),
        };
      }
    }

    throw new ApiError("Неверный логин или пароль", 500);
  }

  async updateTokens(refreshToken?: string) {
    const { iat, exp, ...profile } = await verifyToken(refreshToken);

    return this.getTokens(profile);
  }

  async getTokens(profile: PrivateProfile) {
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

  private _getProfile(username: string): Promise<Profile | null> {
    return this._redisService.get<Profile>(username);
  }

  private _setProfile(username: string, body: Profile) {
    return this._redisService.set(username, body).catch(() => {
      throw new ApiError("Клиент не найден в базе данных", 500);
    });
  }
}

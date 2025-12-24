import { IUserDto, IUserPassword } from "../user/user.model";

export interface IUserResetPasswordRequest extends IUserPassword {
  token: string;
}

export interface ITokensDto {
  accessToken: string;
  refreshToken: string;
}

export interface IUserWithTokensDto extends IUserDto {
  tokens: ITokensDto;
}

export interface IUserLogin {
  /** Может быть телефоном, email-ом и username-ом  */
  login: string;
}

export interface ISignInRequest extends IUserLogin {
  password: string;
}

export interface IAuthenticateRequest {
  code: string;
}

export type TSignUpRequest =
  | {
      firstName?: string;
      lastName?: string;
      password: string;
    } & (
      | {
          email?: string;
          phone: string;
        }
      | {
          email: string;
          phone?: string;
        }
    );

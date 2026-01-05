import { IUserChangePasswordDto, IUserDto } from "../user/user.dto";

export interface IUserResetPasswordRequest extends IUserChangePasswordDto {
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

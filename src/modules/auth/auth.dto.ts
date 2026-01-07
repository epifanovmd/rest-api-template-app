import { IUserChangePasswordDto, UserDto } from "../user/dto";

export interface IUserResetPasswordRequestDto extends IUserChangePasswordDto {
  token: string;
}

export interface ITokensDto {
  accessToken: string;
  refreshToken: string;
}

export interface IUserWithTokensDto extends UserDto {
  tokens: ITokensDto;
}

export interface IUserLoginRequestDto {
  /** Может быть телефоном, email-ом и username-ом  */
  login: string;
}

export interface ISignInRequestDto extends IUserLoginRequestDto {
  password: string;
}

export interface IAuthenticateRequestDto {
  code: string;
}

export type TSignUpRequestDto =
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

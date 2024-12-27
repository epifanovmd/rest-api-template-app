import { IProfilePassword } from "../profile";
import { IProfileDto, TProfileCreateModel } from "../profile/profile.model";

export interface IProfileResetPasswordRequest extends IProfilePassword {
  token: string;
}

export interface ITokensDto {
  accessToken: string;
  refreshToken: string;
}

export interface IProfileWithTokensDto extends IProfileDto {
  tokens: ITokensDto;
}

export interface IProfileLogin {
  /** Может быть телефоном, email-ом и username-ом  */
  login: string;
}

export interface ISignInRequest extends IProfileLogin {
  password: string;
}

export interface ISignUpRequest
  extends Omit<TProfileCreateModel, "passwordHash" | "roleId" | "challenge">,
    IProfilePassword {}

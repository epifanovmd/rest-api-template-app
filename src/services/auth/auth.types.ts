import { IProfileDto, TProfileCreateModel } from "../profile";

export interface IProfilePassword {
  password: string;
}

export interface ITokensDto {
  accessToken: string;
  refreshToken: string;
}

export interface IProfileWithTokensDto extends IProfileDto {
  tokens: ITokensDto;
}

export interface ISignInRequestDto {
  username: string;
  password: string;
}

export interface ISignUpRequestDto
  extends ISignInRequestDto,
    Omit<TProfileCreateModel, "id" | "username" | "passwordHash">,
    IProfilePassword {}

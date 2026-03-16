import {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";

import { ITokensDto } from "../../core";

export interface IGenerateAuthenticationOptionsRequestDto {
  /** Email или телефон пользователя */
  login: string;
}

export interface IVerifyRegistrationRequestDto {
  data: RegistrationResponseJSON;
}

export interface IVerifyAuthenticationRequestDto {
  data: AuthenticationResponseJSON;
}

export interface IVerifyAuthenticationResponseDto {
  verified: boolean;
  tokens?: ITokensDto;
}

export interface IVerifyRegistrationResponseDto {
  verified: boolean;
}

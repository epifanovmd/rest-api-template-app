import {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";

import { ITokensDto } from "../auth/auth.dto";

export interface IVerifyRegistrationRequestDto {
  userId: string;
  data: RegistrationResponseJSON;
}

export interface IVerifyAuthenticationRequestDto {
  userId: string;
  data: AuthenticationResponseJSON;
}

export interface IVerifyAuthenticationResponseDto {
  verified: boolean;
  tokens?: ITokensDto;
}

export interface IVerifyRegistrationResponseDto {
  verified: boolean;
}

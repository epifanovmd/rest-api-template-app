import {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";

import { ITokensDto } from "../auth";

export interface IVerifyRegistrationRequest {
  userId: string;
  data: RegistrationResponseJSON;
}

export interface IVerifyAuthenticationRequest {
  userId: string;
  data: AuthenticationResponseJSON;
}

export interface IVerifyAuthenticationResponse {
  verified: boolean;
  tokens?: ITokensDto;
}

export interface IVerifyRegistrationResponse {
  verified: boolean;
}

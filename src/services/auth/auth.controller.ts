import { inject, injectable } from "inversify";
import { Body, Controller, Post, Route, Tags } from "tsoa";

import { AuthService } from "./auth.service";
import {
  IProfileWithTokensDto,
  ISignInRequestDto,
  ISignUpRequestDto,
  ITokensDto,
} from "./auth.types";

const PHONE_REGEX = /^[\d+][\d() -]{4,14}\d$/;
const EMAIL_REGEX = /^(\S+)@([a-z0-9-]+)(\.)([a-z]{2,4})(\.?)([a-z]{0,4})+$/;

const authService = new AuthService();

// @injectable()
@Tags("Authorization")
@Route("api/auth")
export class AuthController extends Controller {
  /**
   * Endpoint description
   * @param body Body param
   * @summary Endpoint summary.
   */
  @Post("/signUp")
  signUp(@Body() body: ISignUpRequestDto): Promise<IProfileWithTokensDto> {
    return authService.signUp(body);
  }

  @Post("/signIn")
  signIn(@Body() body: ISignInRequestDto): Promise<IProfileWithTokensDto> {
    return authService.signIn(body);
  }

  @Post("/refresh")
  refresh(@Body() body: { refreshToken: string }): Promise<ITokensDto> {
    return authService.updateTokens(body.refreshToken);
  }
}

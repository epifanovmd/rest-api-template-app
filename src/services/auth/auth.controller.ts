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

@injectable()
@Tags("Authorization")
@Route("api/auth")
export class AuthController extends Controller {
  constructor(@inject(AuthService) private _authService: AuthService) {
    super();
  }

  /**
   * Endpoint description
   * @param body Body param
   * @summary Endpoint summary.
   */
  @Post("/signUp")
  signUp(@Body() body: ISignUpRequestDto): Promise<IProfileWithTokensDto> {
    return this._authService.signUp(body);
  }

  @Post("/signIn")
  signIn(@Body() body: ISignInRequestDto): Promise<IProfileWithTokensDto> {
    return this._authService.signIn(body);
  }

  @Post("/refresh")
  refresh(@Body() body: { refreshToken: string }): Promise<ITokensDto> {
    return this._authService.updateTokens(body.refreshToken);
  }
}

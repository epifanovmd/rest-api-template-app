import { inject, injectable } from "inversify";
import { Body, Controller, Post, Route, Tags } from "tsoa";

import { ApiResponse } from "../../dto/ApiResponse";
import { AuthService } from "./auth.service";
import {
  IProfileLogin,
  IProfileResetPasswordRequest,
  IProfileWithTokensDto,
  ISignInRequest,
  ISignUpRequest,
  ITokensDto,
} from "./auth.types";

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
  signUp(@Body() body: ISignUpRequest): Promise<IProfileWithTokensDto> {
    return this._authService.signUp(body);
  }

  @Post("/signIn")
  signIn(@Body() body: ISignInRequest): Promise<IProfileWithTokensDto> {
    return this._authService.signIn(body);
  }

  @Post("requestResetPassword")
  requestResetPassword(@Body() { login }: IProfileLogin): Promise<ApiResponse> {
    return this._authService.requestResetPassword(login);
  }

  @Post("resetPassword")
  resetPassword(
    @Body() body: IProfileResetPasswordRequest,
  ): Promise<ApiResponse> {
    return this._authService.resetPassword(body.token, body.password);
  }

  @Post("/refresh")
  refresh(@Body() body: { refreshToken: string }): Promise<ITokensDto> {
    return this._authService.updateTokens(body.refreshToken);
  }
}

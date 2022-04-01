import { sign } from "jsonwebtoken";
import sha256 from "sha256";
import { Body, Controller, Post, Route, Tags } from "tsoa";
import { jwtSecretKey } from "../../common/constants";
import { ErrorType } from "../../common/errorType";
import { ApiError } from "../../common/handlers/errorHandler";
import { Login, Registration, UserDto } from "./UsersModel";
import { UsersService } from "./UsersService";

export interface TokenPayload {
  id: string;
  role: string;
}

const { createUser, getUsersById, getUsersByAttr } = new UsersService();

@Tags("Authorization")
@Route("api/auth")
export class AuthController extends Controller {
  @Post("/registration")
  registration(@Body() body: Registration): Promise<UserDto> {
    const { email } = body;

    if (!email) {
      return Promise.reject(
        new ApiError(
          "ValidateException",
          400,
          ErrorType.ValidateException,
          "Email is note valid",
        ),
      );
    }

    return createUser(body).then(result =>
      getUsersById(result.getDataValue("id")),
    );
  }

  @Post("/login")
  login(@Body() body: Login): Promise<UserDto> {
    const { username, password } = body;

    return getUsersByAttr({ username }).then(result => {
      let token = "";

      if (result) {
        const { salt, passwordHash, role, id } = result;

        if (passwordHash === sha256(password + salt)) {
          token = sign(
            {
              id,
              role,
            },
            jwtSecretKey,
            { algorithm: "HS256", expiresIn: "24h" },
          );
          this.setHeader("set-cookie", `token=${token};path=/;`);
        } else {
          return Promise.reject(
            new ApiError(
              "ValidateException",
              400,
              ErrorType.UnauthorizedException,
              "Incorrect username or password",
            ),
          );
        }
      }

      return {
        id: result.id,
        username: result.username,
        firstName: result.firstName,
        lastName: result.lastName,
        email: result.email,
        role: result.role,
      };
    });
  }
}

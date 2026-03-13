import { inject, injectable } from "inversify";
import sha256 from "sha256";

import { config } from "../../config";
import { IBootstrap } from "../core";
import { UserService } from "../modules/user";

@injectable()
export class AdminBootstrap implements IBootstrap {
  constructor(@inject(UserService) private readonly userService: UserService) {}

  async initialize(): Promise<void> {
    await this.userService
      .createAdmin({
        email: config.auth.admin.email,
        passwordHash: sha256(config.auth.admin.password),
      })
      .catch(() => null);
  }
}

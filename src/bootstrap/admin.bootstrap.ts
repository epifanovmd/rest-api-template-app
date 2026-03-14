import bcrypt from "bcrypt";
import { inject, injectable } from "inversify";

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
        passwordHash: await bcrypt.hash(config.auth.admin.password, 12),
      })
      .catch(() => null);
  }
}

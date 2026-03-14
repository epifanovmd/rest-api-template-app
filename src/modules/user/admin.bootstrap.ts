import bcrypt from "bcrypt";
import { inject } from "inversify";

import { config } from "../../../config";
import { IBootstrap, Injectable } from "../../core";
import { UserService } from "./user.service";

@Injectable()
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

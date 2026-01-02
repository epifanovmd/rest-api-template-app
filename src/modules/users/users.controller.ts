import { inject } from "inversify";
import { Context } from "koa";

import { AuthGuard, UseGuards } from "../../core";
import { UsersService } from "./users.service";

export class UsersController {
  constructor(@inject(UsersService) private usersService: UsersService) {}

  @UseGuards(AuthGuard)
  // @Roles(UserRole.ADMIN)
  async getAllUsers(ctx: Context) {
    const users = await this.usersService.findAll();

    ctx.body = users;
  }

  @UseGuards(AuthGuard)
  async getUser(ctx: Context) {
    const { id } = ctx.params;
    const user = await this.usersService.findOne(id);

    ctx.body = user;
  }
}

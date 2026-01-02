// src/modules/users/services/users.service.ts
import { inject, injectable } from "inversify";

import { UserResponseDto } from "./dto/update-user.dto";
import { UsersRepository } from "./users.repository";

@injectable()
export class UsersService {
  constructor(
    @inject(UsersRepository) private usersRepository: UsersRepository,
  ) {}

  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.usersRepository.repository.find();

    return users.map(user => user as unknown as UserResponseDto);
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.repository.findOne({
      where: { id },
    });

    if (!user) {
      throw new Error("User not found");
    }

    return user as unknown as UserResponseDto;
  }
}

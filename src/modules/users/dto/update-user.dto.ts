import { UserRole } from "../user.entity";
import { CreateUserDto } from "./create-user.dto";

export class UpdateUserDto extends CreateUserDto {}

export class UserResponseDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;

  createdAt: Date;

  updatedAt: Date;
}

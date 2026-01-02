// src/modules/users/dto/create-user.dto.ts
// import { ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateUserDto {
  // @ApiProperty({ example: "John Doe" })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  // @ApiProperty({ example: "john@example.com" })
  @IsEmail()
  email: string;

  // @ApiProperty({ example: "Password123!" })
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: "Password too weak",
  })
  password: string;
}

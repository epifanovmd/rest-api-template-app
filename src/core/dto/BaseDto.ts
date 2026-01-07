import { HttpException } from "@force-dev/utils";

export abstract class BaseDto {
  protected constructor(entity: any) {
    if (!entity) {
      const error = new HttpException(
        `[${this.constructor.name}] Cannot create DTO: entity is undefined`,
        500,
      );

      if (process.env.NODE_ENV === "development") {
        const stack = error.stack?.split("\n").map(line => line.trim());

        throw new HttpException(error.message, error.status, { stack });
      }

      throw error;
    }
  }
}

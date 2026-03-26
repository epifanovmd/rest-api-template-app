import { BaseDto } from "../../core/dto/BaseDto";
import { Session } from "./session.entity";

export class SessionDto extends BaseDto {
  id: string;
  userId: string;
  deviceName: string | null;
  deviceType: string | null;
  ip: string | null;
  userAgent: string | null;
  lastActiveAt: Date;
  createdAt: Date;

  constructor(entity: Session) {
    super(entity);

    this.id = entity.id;
    this.userId = entity.userId;
    this.deviceName = entity.deviceName;
    this.deviceType = entity.deviceType;
    this.ip = entity.ip;
    this.userAgent = entity.userAgent;
    this.lastActiveAt = entity.lastActiveAt;
    this.createdAt = entity.createdAt;
  }

  static fromEntity(entity: Session) {
    return new SessionDto(entity);
  }
}

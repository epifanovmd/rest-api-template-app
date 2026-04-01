import { Session } from "../../session/session.entity";

export class UserLoggedInEvent {
  constructor(
    public readonly userId: string,
    public readonly sessionId?: string,
    public readonly session?: Session,
  ) {}
}

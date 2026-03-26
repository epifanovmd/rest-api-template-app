import { Module } from "../../core";
import { SessionController } from "./session.controller";
import { SessionRepository } from "./session.repository";
import { SessionService } from "./session.service";

@Module({
  providers: [SessionRepository, SessionService, SessionController],
})
export class SessionModule {}

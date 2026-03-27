import { Module } from "../../core";
import { asSocketListener } from "../socket";
import { SessionController } from "./session.controller";
import { SessionListener } from "./session.listener";
import { SessionRepository } from "./session.repository";
import { SessionService } from "./session.service";

@Module({
  providers: [
    SessionRepository,
    SessionService,
    SessionController,
    asSocketListener(SessionListener),
  ],
})
export class SessionModule {}

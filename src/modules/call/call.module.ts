import { Module } from "../../core";
import { asSocketHandler, asSocketListener } from "../socket";
import { CallController } from "./call.controller";
import { CallHandler } from "./call.handler";
import { CallListener } from "./call.listener";
import { CallRepository } from "./call.repository";
import { CallService } from "./call.service";

@Module({
  providers: [
    CallRepository,
    CallService,
    CallController,
    asSocketHandler(CallHandler),
    asSocketListener(CallListener),
  ],
})
export class CallModule {}

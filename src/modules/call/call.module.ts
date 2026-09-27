import { asJobHandler, Module } from "../../core";
import { asSocketHandler, asSocketListener } from "../socket";
import { CallController } from "./call.controller";
import { Call } from "./call.entity";
import { CallHandler } from "./call.handler";
import { CallListener } from "./call.listener";
import { CallRepository } from "./call.repository";
import { CallService } from "./call.service";
import {
  CallRingingSweepJobHandler,
  CallRingingTimeoutJobHandler,
} from "./call-ringing.job";

@Module({
  entities: [Call],
  providers: [
    CallRepository,
    CallService,
    CallController,
    asSocketHandler(CallHandler),
    asSocketListener(CallListener),
    asJobHandler(CallRingingTimeoutJobHandler),
    asJobHandler(CallRingingSweepJobHandler),
  ],
})
export class CallModule {}

import { Module } from "../../core";
import { DialogMembersService } from "../dialog-members";
import { DialogMessagesService } from "../dialog-messages";
import { asSocketHandler, asSocketListener } from "../socket";
import { DialogController } from "./dialog.controller";
import { DialogService } from "./dialog.service";
import { DialogMessagingHandler } from "./dialog-messaging.handler";
import { DialogPresenceHandler } from "./dialog-presence.handler";
import { DialogRoomManager } from "./dialog-room.manager";
import { DialogSocketEventHandler } from "./dialog-socket-event.handler";
import { DialogTypingHandler } from "./dialog-typing.handler";

@Module({
  providers: [
    DialogController,
    DialogService,
    DialogMembersService,
    DialogMessagesService,
    asSocketHandler(DialogMessagingHandler),
    asSocketHandler(DialogPresenceHandler),
    asSocketHandler(DialogTypingHandler),
    asSocketListener(DialogSocketEventHandler),
    asSocketListener(DialogRoomManager),
  ],
})
export class DialogModule {}

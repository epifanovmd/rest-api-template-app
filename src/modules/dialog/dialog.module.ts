import { Module } from "../../core";
import { DialogMembersRepository } from "../dialog-members/dialog-members.repository";
import { DialogMembersService } from "../dialog-members/dialog-members.service";
import { DialogMessagesRepository } from "../dialog-messages/dialog-messages.repository";
import { DialogMessagesService } from "../dialog-messages/dialog-messages.service";
import { MessageFilesRepository } from "../message-files/message-files.repository";
import { asSocketHandler, asSocketListener } from "../socket";
import { DialogController } from "./dialog.controller";
import { DialogRepository } from "./dialog.repository";
import { DialogService } from "./dialog.service";
import { DialogMessagingHandler } from "./dialog-messaging.handler";
import { DialogPresenceHandler } from "./dialog-presence.handler";
import { DialogRoomManager } from "./dialog-room.manager";
import { DialogSocketEventHandler } from "./dialog-socket-event.handler";
import { DialogTypingHandler } from "./dialog-typing.handler";

@Module({
  providers: [
    // Репозитории
    DialogRepository,
    DialogMembersRepository,
    DialogMessagesRepository,
    MessageFilesRepository,
    // Сервисы
    DialogController,
    DialogService,
    DialogMembersService,
    DialogMessagesService,
    // Socket handlers (входящие события)
    asSocketHandler(DialogMessagingHandler),
    asSocketHandler(DialogPresenceHandler),
    asSocketHandler(DialogTypingHandler),
    // Socket event listeners (EventBus → socket/push)
    asSocketListener(DialogSocketEventHandler),
    asSocketListener(DialogRoomManager),
  ],
})
export class DialogModule {}

import { Module } from "../../core/decorators/module.decorator";
import { DialogMembersService } from "../dialog-members/dialog-members.service";
import { DialogMessagesService } from "../dialog-messages/dialog-messages.service";
import {
  SOCKET_EVENT_LISTENER,
} from "../socket/socket-event-listener.interface";
import { SOCKET_HANDLER } from "../socket/socket-handler.interface";
import { DialogController } from "./dialog.controller";
import { DialogService } from "./dialog.service";
import { DialogRoomManager } from "./dialog-room.manager";
import { DialogSocketHandler } from "./dialog-socket.handler";
import { DialogSocketEventHandler } from "./dialog-socket-event.handler";

/**
 * Модуль диалогов (сообщений, участников, socket-обработчиков).
 *
 * DialogSocketHandler — ISocketHandler: обрабатывает входящие socket-события.
 * DialogSocketEventHandler — ISocketEventListener: EventBus → socket-уведомления.
 * DialogRoomManager — ISocketEventListener: EventBus → управление socket-комнатами.
 */
@Module({
  providers: [
    DialogController,
    DialogService,
    DialogMembersService,
    DialogMessagesService,
    { provide: SOCKET_HANDLER, useClass: DialogSocketHandler },
    { provide: SOCKET_EVENT_LISTENER, useClass: DialogSocketEventHandler },
    { provide: SOCKET_EVENT_LISTENER, useClass: DialogRoomManager },
  ],
})
export class DialogModule {}

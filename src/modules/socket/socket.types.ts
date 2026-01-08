import { Server, Socket as SocketIO } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";

import { DialogMessagesDto } from "../dialog-messages/dto";
import { PublicUserDto } from "../user/dto";
import { User } from "../user/user.entity";

export interface ISocketEvents {
  messageReceived: (...args: [messageId: string[], dialogId: string]) => void;
  online: (...args: [isOnline: boolean]) => void;
  checkOnline: (
    ...args: [userId: string, callback: (isOnline: boolean) => void]
  ) => void;
  typing: (...args: [dialogId: string]) => void;
  join_dialog: (...args: [dialogId: string]) => void;
  leave_dialog: (...args: [dialogId: string]) => void;
}

export interface ISocketEmitEvents {
  authenticated: (...args: [{ userId: string }]) => void;
  auth_error: (...args: [{ message: string }]) => void;
  message: (...args: [message: DialogMessagesDto]) => void;
  messageReceived: (
    ...args: [{ messageIds: string[]; dialogId: string }]
  ) => void;
  deleteMessage: (...args: [dialogId: string, messageId: string]) => void;
  newDialog: (...args: [dialogId: string]) => void;
  deleteDialog: (...args: [dialogId: string]) => void;
  online: (...args: [{ userId: string; isOnline: boolean }]) => void;
  checkOnline: (...args: [isOnline: boolean]) => void;
  typing: (...args: [{ user: PublicUserDto; isTyping: boolean }]) => void;
}

export type TSocket = SocketIO<
  ISocketEvents,
  ISocketEmitEvents,
  DefaultEventsMap,
  User
>;

export type TServer = Server<
  ISocketEvents,
  ISocketEmitEvents,
  DefaultEventsMap,
  User
>;

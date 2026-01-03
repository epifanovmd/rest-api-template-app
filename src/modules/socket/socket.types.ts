import { Server, Socket as SocketIO } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";

import { IDialogMessagesDto } from "../dialog-messages/dialog-messages.dto";
import { IUserDto } from "../user/user.dto";

export interface ISocketEvents {
  messageReceived: (...args: [messageId: string[], dialogId: string]) => void;
  online: (...args: [isOnline: boolean]) => void;
  checkOnline: (
    ...args: [userId: string, callback: (isOnline: boolean) => void]
  ) => void;
  typingStart: (...args: [dialogId: string]) => void;
  typingStop: (...args: [dialogId: string]) => void;
  typing: (...args: [userId: string]) => void;
}

export interface ISocketEmitEvents {
  authenticated: (...args: [{ userId: string }]) => void;
  auth_error: (...args: [{ message: string }]) => void;
  message: (...args: [message: IDialogMessagesDto]) => void;
  messageReceived: (
    ...args: [{ messageIds: string[]; dialogId: string }]
  ) => void;
  deleteMessage: (...args: [dialogId: string, messageId: string]) => void;
  newDialog: (...args: [dialogId: string]) => void;
  deleteDialog: (...args: [dialogId: string]) => void;
  online: (...args: [{ userId: string; isOnline: boolean }]) => void;
  checkOnline: (...args: [isOnline: boolean]) => void;
  typing: (...args: [{ userId: string; isTyping: boolean }]) => void;
}

export type TSocket = SocketIO<
  ISocketEvents,
  ISocketEmitEvents,
  DefaultEventsMap,
  IUserDto
>;

export type TServer = Server<
  ISocketEvents,
  ISocketEmitEvents,
  DefaultEventsMap,
  IUserDto
>;

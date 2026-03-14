import { inject } from "inversify";

import { Injectable, logger } from "../../core";
import { DialogMembersRepository } from "../dialog-members";
import { DialogMessagesService } from "../dialog-messages";
import { ISocketHandler, SocketEmitterService, TSocket } from "../socket";
import { DialogRepository } from "./dialog.repository";

/**
 * Отвечает за:
 * - вступление в dialog-rooms при подключении
 * - подтверждение доставки сообщений (messageReceived)
 * - ручной join/leave диалога с проверкой членства
 */
@Injectable()
export class DialogMessagingHandler implements ISocketHandler {
  constructor(
    @inject(DialogRepository)
    private readonly dialogRepository: DialogRepository,
    @inject(DialogMembersRepository)
    private readonly membersRepository: DialogMembersRepository,
    @inject(DialogMessagesService)
    private readonly messagesService: DialogMessagesService,
    @inject(SocketEmitterService)
    private readonly emitter: SocketEmitterService,
  ) {}

  async onConnection(socket: TSocket): Promise<void> {
    const { userId } = socket.data;

    const dialogs = await this.dialogRepository.find({
      where: { members: { userId } },
      select: { id: true },
    });

    dialogs.forEach(dialog => socket.join(`dialog_${dialog.id}`));

    this.registerHandlers(socket);
  }

  private registerHandlers(socket: TSocket): void {
    const { userId } = socket.data;

    socket.on(
      "messageReceived",
      async (messageIds: string[], dialogId: string) => {
        // Проверяем, что сокет находится в комнате диалога (= является членом)
        if (!socket.rooms.has(`dialog_${dialogId}`)) {
          logger.warn(
            { userId, dialogId },
            "[DialogMessagingHandler] messageReceived: not a room member",
          );

          return;
        }

        try {
          await this.messagesService.updateReceived(messageIds);
          this.emitter.toRoom(`dialog_${dialogId}`, "messageReceived", {
            messageIds,
            dialogId,
          });
        } catch (err) {
          logger.error(
            { err },
            "[DialogMessagingHandler] messageReceived error",
          );
        }
      },
    );

    socket.on("join_dialog", async (dialogId: string) => {
      const member = await this.membersRepository.findByUserIdAndDialogId(
        userId,
        dialogId,
        {},
      );

      if (!member) {
        logger.warn(
          { userId, dialogId },
          "[DialogMessagingHandler] join_dialog: not a member",
        );

        return;
      }

      socket.join(`dialog_${dialogId}`);
    });

    socket.on("leave_dialog", (dialogId: string) => {
      socket.leave(`dialog_${dialogId}`);
    });
  }
}

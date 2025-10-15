import { NotFoundException } from "@force-dev/utils";
import { inject, injectable } from "inversify";
import { Includeable, Op, WhereOptions } from "sequelize";

// TODO: решить проблему с циклической зависимостью
import { DialogService } from "../dialog/dialog.service";
import { FcmTokenService } from "../fcm-token";
import { Files } from "../file/file.model";
import { SocketService } from "../socket";
import { UserService } from "../user";
import { User } from "../user/user.model";
import { MessageFiles } from "./dialog-message-files.model";
import {
  DialogMessages,
  IMessagesRequest,
  IMessagesUpdateRequest,
} from "./dialog-messages.model";

@injectable()
export class DialogMessagesService {
  constructor(
    @inject(SocketService) private _socketService: SocketService,
    @inject(DialogService) private _dialogService: DialogService,
    @inject(FcmTokenService) private _fcmTokenService: FcmTokenService,
  ) {}

  getAllMessages = (dialogId: string, offset?: number, limit?: number) =>
    DialogMessages.findAll({
      limit,
      offset,
      where: {
        dialogId,
      },
      order: [["createdAt", "DESC"]],
      include: DialogMessagesService.include,
    });

  getLastMessage = (dialogId: string) =>
    DialogMessages.findAll({
      where: { dialogId },
      limit: 1,
      order: [["createdAt", "DESC"]],
    });

  getMessagesByAttr = (where: WhereOptions) =>
    DialogMessages.findOne({
      where,
      include: DialogMessagesService.include,
    }).then(result => {
      if (result === null) {
        return Promise.reject(new NotFoundException("Сообщение не найдено"));
      }

      return result;
    });

  getMessageById = (id: string, userId?: string) => {
    return this.getMessagesByAttr({ id, userId });
  };

  appendMessage = async (userId: string, body: IMessagesRequest) => {
    const dialog = await this._dialogService.getDialog(body.dialogId, userId);

    return DialogMessages.create({
      ...body,
      userId,
      sent: true,
    }).then(async message => {
      const result = await this.getMessageById(message.id, userId);

      const members = dialog.members.filter(member => member.userId !== userId);

      members.forEach(member => {
        this.sendSocketMessage(member.userId, result.toJSON());
        this.sendPushNotification(member.userId, result);
      });

      if (body.imageIds?.length) {
        const files = await Files.findAll({ where: { id: body.imageIds } });

        await message.addImages(files);
      }

      if (body.videoIds?.length) {
        const files = await Files.findAll({ where: { id: body.videoIds } });

        await message.addVideos(files);
      }

      if (body.audioIds?.length) {
        const files = await Files.findAll({ where: { id: body.audioIds } });

        await message.addAudios(files);
      }

      // await this._dialogService.updateDialogLastMessage(
      //   body.dialogId,
      //   message.id,
      // );

      return result;
    });
  };

  updateMessage = async (
    id: string,
    userId,
    {
      imageIds,
      audioIds,
      videoIds,
      deleteFileIds,
      ...rest
    }: IMessagesUpdateRequest,
  ) => {
    const message = await DialogMessages.findByPk(id);

    if (!message || message.userId !== userId) {
      return Promise.reject(new NotFoundException("Сообщение не найдено"));
    }

    return DialogMessages.update(rest, { where: { id } }).then(async () => {
      if (deleteFileIds && deleteFileIds.length > 0) {
        await MessageFiles.destroy({
          where: {
            fileId: {
              [Op.in]: deleteFileIds,
            },
            messageId: id,
          },
        });
      }

      const message = await this.getMessageById(id);
      const dialog = await this._dialogService.getDialog(
        message.dialogId,
        userId,
      );

      if (imageIds?.length) {
        const files = await Files.findAll({ where: { id: imageIds } });

        await message.addImages(files);
      }

      if (videoIds?.length) {
        const files = await Files.findAll({ where: { id: videoIds } });

        await message.addVideos(files);
      }

      if (audioIds?.length) {
        const files = await Files.findAll({ where: { id: audioIds } });

        await message.addAudios(files);
      }

      dialog.members.forEach(member => {
        this.sendSocketMessage(member.userId, message);
      });

      return message;
    });
  };

  deleteMessage = async (id: string, userId: string) => {
    const message = await DialogMessages.findByPk(id);

    if (!message /* || message.userId !== userId */) {
      return Promise.reject(new NotFoundException("Сообщение не найдено"));
    }

    const dialog = await this._dialogService.getDialog(
      message.dialogId,
      userId,
    );

    dialog.members.forEach(({ userId }) => {
      if (this._socketService.getClient(userId)) {
        const client = this._socketService.getClient(userId);

        if (client) {
          client.emit("deleteMessage", dialog.id, id);
        }
      }
    });

    return message.destroy();
  };

  sendSocketMessage = (recipientId: string, message: DialogMessages) => {
    if (this._socketService.getClient(recipientId)) {
      const client = this._socketService.getClient(recipientId);

      return !!client?.emit("message", message);
    }

    return false;
  };

  sendPushNotification = (recipientId: string, message: DialogMessages) =>
    this._fcmTokenService.getTokens(recipientId).then(async fcmTokens => {
      const badge = await this._dialogService.getUnreadMessagesCount(
        recipientId,
      );

      for (const { token, id } of fcmTokens) {
        await this._fcmTokenService
          .sendFcmMessage({
            dialogId: message.dialogId,
            to: token,
            badge,
            message: {
              sound: "default",
              description: message.text,
              title: "message.user.email",
            },
          })
          .catch(() => {
            this._fcmTokenService.deleteToken(id).then();
          });
      }
    });

  static include: Includeable[] = [
    {
      model: DialogMessages,
      required: false,
      attributes: { exclude: ["replyId"] },
      as: "reply",
      include: [
        {
          model: Files,
          as: "images", // Ассоциация для изображений
          required: false,
          through: { attributes: [] }, // Исключаем все поля из промежуточной таблицы
        },
        {
          model: Files,
          as: "videos", // Ассоциация для видео
          required: false,
          through: { attributes: [] }, // Исключаем все поля из промежуточной таблицы
        },
        {
          model: Files,
          as: "audios", // Ассоциация для аудио
          required: false,
          through: { attributes: [] }, // Исключаем все поля из промежуточной таблицы
        },
        {
          model: User,
          attributes: UserService.attributes,
          required: true,
          // include: [
          //   {
          //     model: Files,
          //     as: "avatar",
          //     required: false,
          //   },
          // ],
        },
      ],
    },
    {
      model: Files,
      as: "images", // Загрузка изображений для ответа
      required: false,
      through: { attributes: [] }, // Исключаем все поля из промежуточной таблицы
    },
    {
      model: Files,
      as: "videos", // Ассоциация для видео
      required: false,
      through: { attributes: [] }, // Исключаем все поля из промежуточной таблицы
    },
    {
      model: Files,
      as: "audios", // Ассоциация для аудио
      required: false,
      through: { attributes: [] }, // Исключаем все поля из промежуточной таблицы
    },
    {
      model: User,
      attributes: UserService.attributes,
      required: true,
      // include: [
      //   {
      //     model: Files,
      //     as: "avatar",
      //     required: false,
      //   },
      // ],
    },
  ];
}

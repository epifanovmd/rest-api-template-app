import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@force-dev/utils";
import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ChatService } from "../chat/chat.service";
import { MessageRepository } from "../message/message.repository";
import { EMessageType } from "../message/message.types";
import { PollDto } from "./dto";
import { PollClosedEvent, PollVotedEvent } from "./events";
import { PollRepository } from "./poll.repository";
import { PollOptionRepository } from "./poll-option.repository";
import { PollVoteRepository } from "./poll-vote.repository";

@Injectable()
export class PollService {
  constructor(
    @inject(PollRepository) private _pollRepo: PollRepository,
    @inject(PollOptionRepository) private _optionRepo: PollOptionRepository,
    @inject(PollVoteRepository) private _voteRepo: PollVoteRepository,
    @inject(MessageRepository) private _messageRepo: MessageRepository,
    @inject(ChatService) private _chatService: ChatService,
    @inject(EventBus) private _eventBus: EventBus,
  ) {}

  async createPoll(
    chatId: string,
    senderId: string,
    data: {
      question: string;
      options: string[];
      isAnonymous?: boolean;
      isMultipleChoice?: boolean;
    },
  ) {
    const canSend = await this._chatService.canSendMessage(chatId, senderId);

    if (!canSend) {
      throw new ForbiddenException(
        "Вы не можете отправлять сообщения в этот чат",
      );
    }

    const poll = await this._messageRepo.withTransaction(async (_repo, em) => {
      const msgRepo = em.getRepository("messages");
      const savedMsg = await msgRepo.save({
        chatId,
        senderId,
        type: EMessageType.POLL,
        content: data.question,
      });

      const messageId = (savedMsg as unknown as { id: string }).id;

      const pollRepo = em.getRepository("polls");
      const savedPoll = await pollRepo.save({
        messageId,
        question: data.question,
        isAnonymous: data.isAnonymous ?? false,
        isMultipleChoice: data.isMultipleChoice ?? false,
      });

      const pollId = (savedPoll as unknown as { id: string }).id;

      const optionRepo = em.getRepository("poll_options");

      for (let i = 0; i < data.options.length; i += 1) {
        await optionRepo.save({
          pollId,
          text: data.options[i],
          position: i,
        });
      }

      await em.getRepository("chats").update(
        { id: chatId },
        { lastMessageAt: new Date() },
      );

      return { id: pollId };
    });

    const fullPoll = await this._pollRepo.findById(poll.id);

    return new PollDto(fullPoll!, senderId);
  }

  async vote(pollId: string, userId: string, optionIds: string[]) {
    const poll = await this._pollRepo.findById(pollId);

    if (!poll) {
      throw new NotFoundException("Опрос не найден");
    }

    if (poll.isClosed) {
      throw new BadRequestException("Опрос закрыт");
    }

    // Validate option IDs belong to this poll
    const validOptionIds = poll.options.map(o => o.id);

    for (const optionId of optionIds) {
      if (!validOptionIds.includes(optionId)) {
        throw new BadRequestException("Некорректный вариант ответа");
      }
    }

    if (!poll.isMultipleChoice && optionIds.length > 1) {
      throw new BadRequestException(
        "В этом опросе можно выбрать только один вариант",
      );
    }

    // Remove existing votes
    await this._voteRepo.deleteByPollAndUser(pollId, userId);

    // Create new votes
    for (const optionId of optionIds) {
      await this._voteRepo.createAndSave({
        pollId,
        optionId,
        userId,
      });
    }

    const updatedPoll = await this._pollRepo.findById(pollId);

    this._eventBus.emit(
      new PollVotedEvent(updatedPoll!, updatedPoll!.message?.chatId ?? "", userId),
    );

    return new PollDto(updatedPoll!, userId);
  }

  async retractVote(pollId: string, userId: string) {
    const poll = await this._pollRepo.findById(pollId);

    if (!poll) {
      throw new NotFoundException("Опрос не найден");
    }

    if (poll.isClosed) {
      throw new BadRequestException("Опрос закрыт");
    }

    await this._voteRepo.deleteByPollAndUser(pollId, userId);

    const updatedPoll = await this._pollRepo.findById(pollId);

    this._eventBus.emit(
      new PollVotedEvent(updatedPoll!, updatedPoll!.message?.chatId ?? "", userId),
    );

    return new PollDto(updatedPoll!, userId);
  }

  async closePoll(pollId: string, userId: string) {
    const poll = await this._pollRepo.findById(pollId);

    if (!poll) {
      throw new NotFoundException("Опрос не найден");
    }

    if (poll.isClosed) {
      throw new BadRequestException("Опрос уже закрыт");
    }

    // Only message sender can close poll
    if (poll.message && poll.message.senderId !== userId) {
      throw new ForbiddenException("Только автор может закрыть опрос");
    }

    poll.isClosed = true;
    poll.closedAt = new Date();
    await this._pollRepo.save(poll);

    const updatedPoll = await this._pollRepo.findById(pollId);

    this._eventBus.emit(
      new PollClosedEvent(
        updatedPoll!,
        updatedPoll!.message?.chatId ?? "",
        userId,
      ),
    );

    return new PollDto(updatedPoll!, userId);
  }

  async getPollById(pollId: string, userId: string) {
    const poll = await this._pollRepo.findById(pollId);

    if (!poll) {
      throw new NotFoundException("Опрос не найден");
    }

    return new PollDto(poll, userId);
  }
}

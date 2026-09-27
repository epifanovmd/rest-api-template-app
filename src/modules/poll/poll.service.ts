import { inject } from "inversify";
import { DataSource } from "typeorm";

import { EventBus, Injectable } from "../../core";
import { ChatError } from "../chat/chat.errors";
import { ChatService } from "../chat/chat.service";
import { EChatMemberRole } from "../chat/chat.types";
import { ChatMemberRepository } from "../chat/chat-member.repository";
import { MessageService } from "../message/message.service";
import { EMessageType } from "../message/message.types";
import { PollDto } from "./dto";
import { PollClosedEvent, PollCreatedEvent, PollVotedEvent } from "./events";
import { Poll } from "./poll.entity";
import { PollError } from "./poll.errors";
import { PollRepository } from "./poll.repository";
import { PollOption } from "./poll-option.entity";
import { PollOptionRepository } from "./poll-option.repository";
import { PollVote } from "./poll-vote.entity";
import { PollVoteRepository } from "./poll-vote.repository";

@Injectable()
export class PollService {
  constructor(
    @inject(PollRepository) private _pollRepo: PollRepository,
    @inject(PollOptionRepository) private _optionRepo: PollOptionRepository,
    @inject(PollVoteRepository) private _voteRepo: PollVoteRepository,
    @inject(MessageService) private _messageService: MessageService,
    @inject(ChatMemberRepository) private _memberRepo: ChatMemberRepository,
    @inject(ChatService) private _chatService: ChatService,
    @inject(EventBus) private _eventBus: EventBus,
    @inject(DataSource) private _dataSource: DataSource,
  ) {}

  /**
   * Опрос создаётся тем же путём, что и сообщение (права, slow mode,
   * lastMessage, непрочитанное, события), — опрос и варианты пишутся в
   * транзакции сообщения.
   */
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
    let pollId: string | null = null;

    await this._messageService.sendMessage(
      chatId,
      senderId,
      { type: EMessageType.POLL, content: data.question },
      {
        allowServiceTypes: true,
        onCreated: async (em, message) => {
          const poll = await em.getRepository(Poll).save({
            messageId: message.id,
            question: data.question,
            isAnonymous: data.isAnonymous ?? false,
            isMultipleChoice: data.isMultipleChoice ?? false,
          });

          await em.getRepository(PollOption).save(
            data.options.map((text, position) => ({
              pollId: poll.id,
              text,
              position,
            })),
          );

          pollId = poll.id;
        },
      },
    );

    const poll = pollId ? await this._pollRepo.findById(pollId) : null;

    if (!poll) {
      throw PollError.NOT_FOUND();
    }

    const memberUserIds = await this._chatService.getMemberUserIds(chatId);

    this._eventBus.emit(
      new PollCreatedEvent(poll, poll.message, chatId, memberUserIds),
    );

    return new PollDto(poll, senderId);
  }

  async vote(pollId: string, userId: string, optionIds: string[]) {
    const poll = await this._findOpenPollForMember(pollId, userId);
    const uniqueOptionIds = [...new Set(optionIds)];
    const validOptionIds = new Set(poll.options.map(o => o.id));

    if (!uniqueOptionIds.every(id => validOptionIds.has(id))) {
      throw PollError.INVALID_OPTION();
    }

    if (!poll.isMultipleChoice && uniqueOptionIds.length > 1) {
      throw PollError.SINGLE_CHOICE();
    }

    await this._dataSource.transaction(async manager => {
      const voteRepo = manager.getRepository(PollVote);

      await voteRepo.delete({ pollId, userId });
      await voteRepo.save(
        uniqueOptionIds.map(optionId =>
          voteRepo.create({ pollId, optionId, userId }),
        ),
      );
    });

    return this._emitVoted(pollId, poll.message.chatId, userId);
  }

  async retractVote(pollId: string, userId: string) {
    const poll = await this._findOpenPollForMember(pollId, userId);

    await this._voteRepo.deleteByPollAndUser(pollId, userId);

    return this._emitVoted(pollId, poll.message.chatId, userId);
  }

  /** Закрыть опрос может автор или ADMIN/OWNER чата (оба — текущие участники). */
  async closePoll(pollId: string, userId: string) {
    const poll = await this._findPoll(pollId);

    if (poll.isClosed) {
      throw PollError.CLOSED(undefined, "Опрос уже закрыт");
    }

    const membership = await this._memberRepo.findMembership(
      poll.message.chatId,
      userId,
    );
    const isAuthor = poll.message.senderId === userId;
    const isAdmin =
      membership?.role === EChatMemberRole.OWNER ||
      membership?.role === EChatMemberRole.ADMIN;

    if (!membership || (!isAuthor && !isAdmin)) {
      throw PollError.CLOSE_FORBIDDEN();
    }

    poll.isClosed = true;
    poll.closedAt = new Date();
    await this._pollRepo.save(poll);

    const updatedPoll = (await this._pollRepo.findById(pollId)) ?? poll;

    this._eventBus.emit(
      new PollClosedEvent(updatedPoll, poll.message.chatId, userId),
    );

    return new PollDto(updatedPoll, userId);
  }

  async getPollById(pollId: string, userId: string) {
    const poll = await this._findPoll(pollId);

    await this._assertMember(poll.message.chatId, userId);

    return new PollDto(poll, userId);
  }

  private async _findPoll(pollId: string) {
    const poll = await this._pollRepo.findById(pollId);

    if (!poll?.message) {
      throw PollError.NOT_FOUND();
    }

    return poll;
  }

  private async _assertMember(chatId: string, userId: string) {
    if (!(await this._chatService.isMember(chatId, userId))) {
      throw ChatError.NOT_MEMBER(
        undefined,
        "Вы не являетесь участником чата с этим опросом",
      );
    }
  }

  /** Опрос, в котором можно голосовать: не закрыт, сообщение не удалено, пользователь — участник. */
  private async _findOpenPollForMember(pollId: string, userId: string) {
    const poll = await this._findPoll(pollId);

    if (poll.isClosed) {
      throw PollError.CLOSED();
    }

    if (poll.message.isDeleted) {
      throw PollError.MESSAGE_DELETED();
    }

    await this._assertMember(poll.message.chatId, userId);

    return poll;
  }

  private async _emitVoted(pollId: string, chatId: string, userId: string) {
    const updatedPoll = await this._findPoll(pollId);

    this._eventBus.emit(new PollVotedEvent(updatedPoll, chatId, userId));

    return new PollDto(updatedPoll, userId);
  }
}

import { BaseDto } from "../../../core/dto/BaseDto";
import { Poll } from "../poll.entity";
import { PollOption } from "../poll-option.entity";

export class PollOptionDto extends BaseDto {
  id: string;
  text: string;
  position: number;
  voterCount: number;
  voterIds: string[];

  constructor(entity: PollOption, isAnonymous: boolean, votes?: Array<{ optionId: string; userId: string }>) {
    super(entity);

    this.id = entity.id;
    this.text = entity.text;
    this.position = entity.position;

    const optionVotes = votes?.filter(v => v.optionId === entity.id) ?? [];

    this.voterCount = optionVotes.length;
    this.voterIds = isAnonymous ? [] : optionVotes.map(v => v.userId);
  }

  static fromEntity(entity: PollOption) {
    return new PollOptionDto(entity, false);
  }
}

export class PollDto extends BaseDto {
  id: string;
  messageId: string;
  question: string;
  isAnonymous: boolean;
  isMultipleChoice: boolean;
  isClosed: boolean;
  closedAt: Date | null;
  options: PollOptionDto[];
  totalVotes: number;
  userVotedOptionIds: string[];
  createdAt: Date;
  updatedAt: Date;

  constructor(entity: Poll, userId?: string) {
    super(entity);

    this.id = entity.id;
    this.messageId = entity.messageId;
    this.question = entity.question;
    this.isAnonymous = entity.isAnonymous;
    this.isMultipleChoice = entity.isMultipleChoice;
    this.isClosed = entity.isClosed;
    this.closedAt = entity.closedAt;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;

    const votes = entity.votes ?? [];

    this.options = (entity.options ?? [])
      .sort((a, b) => a.position - b.position)
      .map(
        opt =>
          new PollOptionDto(
            opt,
            entity.isAnonymous,
            votes.map(v => ({ optionId: v.optionId, userId: v.userId })),
          ),
      );

    this.totalVotes = votes.length;
    this.userVotedOptionIds = userId
      ? votes.filter(v => v.userId === userId).map(v => v.optionId)
      : [];
  }

  static fromEntity(entity: Poll) {
    return new PollDto(entity);
  }
}

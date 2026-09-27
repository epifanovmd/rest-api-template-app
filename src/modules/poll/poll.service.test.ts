import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "../../core/http";
import {
  createMockEventBus,
  createMockRepository,
  uuid,
  uuid2,
  uuid3,
} from "../../test/helpers";
import { EChatMemberRole } from "../chat/chat.types";
import { EMessageType } from "../message/message.types";
import { PollCreatedEvent } from "./events";
import { Poll } from "./poll.entity";
import { PollService } from "./poll.service";
import { PollOption } from "./poll-option.entity";

describe("PollService", () => {
  let service: PollService;
  let pollRepo: ReturnType<typeof createMockRepository>;
  let optionRepo: ReturnType<typeof createMockRepository>;
  let voteRepo: ReturnType<typeof createMockRepository>;
  let messageService: { sendMessage: sinon.SinonStub };
  let memberRepo: { findMembership: sinon.SinonStub };
  let chatService: any;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let txVoteRepo: {
    delete: sinon.SinonStub;
    create: sinon.SinonStub;
    save: sinon.SinonStub;
  };

  const userId = uuid();
  const pollId = uuid2();
  const chatId = uuid3();

  const makePoll = (overrides: Record<string, unknown> = {}) => ({
    id: pollId,
    messageId: "msg-1",
    question: "Favorite color?",
    isAnonymous: false,
    isMultipleChoice: false,
    isClosed: false,
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    options: [
      { id: "opt-1", text: "Red", position: 0 },
      { id: "opt-2", text: "Blue", position: 1 },
    ],
    votes: [],
    message: { id: "msg-1", chatId, senderId: userId, isDeleted: false },
    ...overrides,
  });

  const expectReject = async (
    promise: Promise<unknown>,
    type: new (...args: any[]) => Error,
  ) => {
    try {
      await promise;
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).to.have.property("status", (new type() as any).status);
    }
  };

  beforeEach(() => {
    pollRepo = createMockRepository();
    optionRepo = createMockRepository();
    voteRepo = createMockRepository();
    eventBus = createMockEventBus();

    chatService = {
      isMember: sinon.stub().resolves(true),
      getMemberUserIds: sinon.stub().resolves([userId]),
    };
    messageService = {
      sendMessage: sinon.stub().resolves({ id: "msg-1", chatId }),
    };
    memberRepo = {
      findMembership: sinon
        .stub()
        .resolves({ chatId, userId, role: EChatMemberRole.MEMBER }),
    };

    (pollRepo as any).findById = sinon.stub().resolves(null);
    (voteRepo as any).deleteByPollAndUser = sinon
      .stub()
      .resolves({ affected: 1 });

    txVoteRepo = {
      delete: sinon.stub().resolves({ affected: 1 }),
      create: sinon.stub().callsFake((data: any) => ({ ...data })),
      save: sinon.stub().callsFake((data: any) => Promise.resolve(data)),
    };

    service = new PollService(
      pollRepo as any,
      optionRepo as any,
      voteRepo as any,
      messageService as any,
      memberRepo as any,
      chatService as any,
      eventBus as any,
      {
        transaction: sinon
          .stub()
          .callsFake((cb: any) =>
            cb({ getRepository: sinon.stub().returns(txVoteRepo) }),
          ),
      } as any,
    );
  });

  afterEach(() => sinon.restore());

  describe("createPoll", () => {
    it("идёт через sendMessage: служебный тип POLL, опрос в той же транзакции", async () => {
      const txPollRepo = { save: sinon.stub().resolves({ id: pollId }) };
      const txOptionRepo = { save: sinon.stub().resolves([]) };
      const em = {
        getRepository: sinon.stub().callsFake((target: unknown) => {
          if (target === Poll) return txPollRepo;
          if (target === PollOption) return txOptionRepo;

          return null;
        }),
      };

      messageService.sendMessage.callsFake(
        async (_chatId: string, _senderId: string, _data: any, opts: any) => {
          await opts.onCreated(em, { id: "msg-1" });

          return { id: "msg-1", chatId };
        },
      );
      (pollRepo as any).findById.resolves(makePoll());

      const result = await service.createPoll(chatId, userId, {
        question: "Favorite color?",
        options: ["Red", "Blue"],
      });

      expect(messageService.sendMessage.calledOnce).to.be.true;

      const [sentChatId, senderId, data, options] =
        messageService.sendMessage.firstCall.args;

      expect(sentChatId).to.equal(chatId);
      expect(senderId).to.equal(userId);
      expect(data).to.include({
        type: EMessageType.POLL,
        content: "Favorite color?",
      });
      expect(options.allowServiceTypes).to.equal(true);
      expect(txPollRepo.save.firstCall.args[0]).to.include({
        messageId: "msg-1",
        question: "Favorite color?",
      });
      expect(txOptionRepo.save.firstCall.args[0]).to.have.length(2);
      expect((pollRepo as any).findById.calledOnceWith(pollId)).to.be.true;

      expect(result).to.have.property("id", pollId);
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        PollCreatedEvent,
      );
    });

    it("нет права писать — ошибка sendMessage пробрасывается", async () => {
      messageService.sendMessage.rejects(new ForbiddenException());

      await expectReject(
        service.createPoll(chatId, userId, {
          question: "Test?",
          options: ["A", "B"],
        }),
        ForbiddenException,
      );
      expect(eventBus.emit.called).to.be.false;
    });
  });

  describe("vote", () => {
    it("should create vote entries for valid options", async () => {
      (pollRepo as any).findById.resolves(makePoll());

      await service.vote(pollId, userId, ["opt-1"]);

      expect(eventBus.emit.calledOnce).to.be.true;
    });

    it("дубли optionIds схлопываются", async () => {
      (pollRepo as any).findById.resolves(makePoll());

      await service.vote(pollId, userId, ["opt-1", "opt-1"]);

      expect(txVoteRepo.save.firstCall.args[0]).to.have.length(1);
    });

    it("should throw when poll is closed", async () => {
      (pollRepo as any).findById.resolves(makePoll({ isClosed: true }));

      await expectReject(
        service.vote(pollId, userId, ["opt-1"]),
        BadRequestException,
      );
    });

    it("голос по удалённому сообщению — 400", async () => {
      (pollRepo as any).findById.resolves(
        makePoll({
          message: { id: "msg-1", chatId, senderId: userId, isDeleted: true },
        }),
      );

      await expectReject(
        service.vote(pollId, userId, ["opt-1"]),
        BadRequestException,
      );
    });

    it("не участник — 403", async () => {
      (pollRepo as any).findById.resolves(makePoll());
      chatService.isMember.resolves(false);

      await expectReject(
        service.vote(pollId, userId, ["opt-1"]),
        ForbiddenException,
      );
    });

    it("should throw when selecting multiple options for single-choice poll", async () => {
      (pollRepo as any).findById.resolves(
        makePoll({ isMultipleChoice: false }),
      );

      await expectReject(
        service.vote(pollId, userId, ["opt-1", "opt-2"]),
        BadRequestException,
      );
    });

    it("should throw when option ID is invalid", async () => {
      (pollRepo as any).findById.resolves(makePoll());

      await expectReject(
        service.vote(pollId, userId, ["invalid-opt"]),
        BadRequestException,
      );
    });

    it("should throw NotFoundException when poll not found", async () => {
      await expectReject(
        service.vote(pollId, userId, ["opt-1"]),
        NotFoundException,
      );
    });
  });

  describe("retractVote", () => {
    it("should remove votes and emit event", async () => {
      (pollRepo as any).findById.resolves(makePoll());

      await service.retractVote(pollId, userId);

      expect(
        (voteRepo as any).deleteByPollAndUser.calledOnceWith(pollId, userId),
      ).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
    });

    it("should throw when poll is closed", async () => {
      (pollRepo as any).findById.resolves(makePoll({ isClosed: true }));

      await expectReject(
        service.retractVote(pollId, userId),
        BadRequestException,
      );
    });

    it("опрос удалённого сообщения — 400", async () => {
      (pollRepo as any).findById.resolves(
        makePoll({
          message: { id: "msg-1", chatId, senderId: userId, isDeleted: true },
        }),
      );

      await expectReject(
        service.retractVote(pollId, userId),
        BadRequestException,
      );
    });
  });

  describe("closePoll", () => {
    it("should close the poll when the creator calls it", async () => {
      const poll = makePoll();

      (pollRepo as any).findById.resolves(poll);

      await service.closePoll(pollId, userId);

      expect(poll.isClosed).to.be.true;
      expect(poll.closedAt).to.be.instanceOf(Date);
      expect(pollRepo.save.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
    });

    it("обычный участник, не автор — 403", async () => {
      (pollRepo as any).findById.resolves(
        makePoll({ message: { id: "msg-1", chatId, senderId: "other-user" } }),
      );

      await expectReject(service.closePoll(pollId, userId), ForbiddenException);
      expect(pollRepo.save.called).to.be.false;
    });

    it("ADMIN чата закрывает чужой опрос", async () => {
      const poll = makePoll({
        message: { id: "msg-1", chatId, senderId: "other-user" },
      });

      (pollRepo as any).findById.resolves(poll);
      memberRepo.findMembership.resolves({
        chatId,
        userId,
        role: EChatMemberRole.ADMIN,
      });

      await service.closePoll(pollId, userId);

      expect(poll.isClosed).to.be.true;
    });

    it("автор, покинувший чат, закрыть не может — 403", async () => {
      (pollRepo as any).findById.resolves(makePoll());
      memberRepo.findMembership.resolves(null);

      await expectReject(service.closePoll(pollId, userId), ForbiddenException);
    });

    it("should throw BadRequestException when poll is already closed", async () => {
      (pollRepo as any).findById.resolves(makePoll({ isClosed: true }));

      await expectReject(
        service.closePoll(pollId, userId),
        BadRequestException,
      );
    });
  });

  describe("getPollById", () => {
    it("should return poll with results", async () => {
      (pollRepo as any).findById.resolves(makePoll());

      const result = await service.getPollById(pollId, userId);

      expect(result).to.have.property("id", pollId);
      expect(result).to.have.property("question", "Favorite color?");
      expect(result.options).to.have.length(2);
    });

    it("не участник чата — 403", async () => {
      (pollRepo as any).findById.resolves(makePoll());
      chatService.isMember.resolves(false);

      await expectReject(
        service.getPollById(pollId, userId),
        ForbiddenException,
      );
    });

    it("should throw NotFoundException when poll not found", async () => {
      await expectReject(
        service.getPollById(pollId, userId),
        NotFoundException,
      );
    });
  });

  describe("коды ошибок", () => {
    const codeOf = (promise: Promise<unknown>) =>
      promise.then(
        () => expect.fail("Should have thrown"),
        (err: { code: string }) => err.code,
      );

    it("опрос не найден — POLL_NOT_FOUND", async () => {
      expect(await codeOf(service.getPollById(pollId, userId))).to.equal(
        "POLL_NOT_FOUND",
      );
    });

    it("голос в закрытом опросе — POLL_CLOSED", async () => {
      (pollRepo as any).findById.resolves(makePoll({ isClosed: true }));

      expect(await codeOf(service.vote(pollId, userId, ["opt-1"]))).to.equal(
        "POLL_CLOSED",
      );
    });

    it("чужой вариант — POLL_INVALID_OPTION", async () => {
      (pollRepo as any).findById.resolves(makePoll());

      expect(await codeOf(service.vote(pollId, userId, ["x"]))).to.equal(
        "POLL_INVALID_OPTION",
      );
    });

    it("не участник — CHAT_NOT_MEMBER", async () => {
      (pollRepo as any).findById.resolves(makePoll());
      chatService.isMember.resolves(false);

      expect(await codeOf(service.getPollById(pollId, userId))).to.equal(
        "CHAT_NOT_MEMBER",
      );
    });
  });
});

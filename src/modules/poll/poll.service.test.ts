import "reflect-metadata";

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@force-dev/utils";
import { expect } from "chai";
import sinon from "sinon";

import {
  createMockEventBus,
  createMockRepository,
  uuid,
  uuid2,
  uuid3,
} from "../../test/helpers";
import { PollService } from "./poll.service";

describe("PollService", () => {
  let service: PollService;
  let pollRepo: ReturnType<typeof createMockRepository>;
  let optionRepo: ReturnType<typeof createMockRepository>;
  let voteRepo: ReturnType<typeof createMockRepository>;
  let messageRepo: ReturnType<typeof createMockRepository>;
  let chatService: any;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let sandbox: sinon.SinonSandbox;

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
    message: { id: "msg-1", chatId, senderId: userId },
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    pollRepo = createMockRepository();
    optionRepo = createMockRepository();
    voteRepo = createMockRepository();
    messageRepo = createMockRepository();
    eventBus = createMockEventBus();

    chatService = {
      canSendMessage: sinon.stub().resolves(true),
      isMember: sinon.stub().resolves(true),
    };

    // Custom repo methods
    (pollRepo as any).findById = sinon.stub().resolves(null);
    (voteRepo as any).deleteByPollAndUser = sinon.stub().resolves({ affected: 1 });

    const mockTxRepo = {
      delete: sinon.stub().resolves({ affected: 1 }),
      create: sinon.stub().callsFake((data: any) => ({ ...data })),
      save: sinon.stub().callsFake((data: any) => Promise.resolve(data)),
    };

    service = new PollService(
      pollRepo as any,
      optionRepo as any,
      voteRepo as any,
      messageRepo as any,
      chatService as any,
      eventBus as any,
      { transaction: sinon.stub().callsFake((cb: any) => cb({ getRepository: sinon.stub().returns(mockTxRepo) })) } as any,
    );
  });

  afterEach(() => sandbox.restore());

  describe("createPoll", () => {
    it("should create a message, poll, and options in a transaction", async () => {
      const poll = makePoll();

      // The transaction callback receives (repo, em)
      messageRepo.withTransaction.callsFake(async (cb: any) => {
        const mockRepoInner = {
          save: sinon.stub().callsFake((data: any) => Promise.resolve({ id: "inner-id", ...data })),
          update: sinon.stub().resolves({ affected: 1 }),
        };
        const mockEm = {
          getRepository: sinon.stub().returns(mockRepoInner),
        };

        return cb(mockRepoInner, mockEm);
      });

      (pollRepo as any).findById.resolves(poll);

      const result = await service.createPoll(chatId, userId, {
        question: "Favorite color?",
        options: ["Red", "Blue"],
      });

      expect(chatService.canSendMessage.calledOnceWith(chatId, userId)).to.be.true;
      expect(messageRepo.withTransaction.calledOnce).to.be.true;
      expect(result).to.have.property("id", pollId);
    });

    it("should throw ForbiddenException when user cannot send messages", async () => {
      chatService.canSendMessage.resolves(false);

      try {
        await service.createPoll(chatId, userId, {
          question: "Test?",
          options: ["A", "B"],
        });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });

  describe("vote", () => {
    it("should create vote entries for valid options", async () => {
      const poll = makePoll();

      (pollRepo as any).findById.resolves(poll);

      await service.vote(pollId, userId, ["opt-1"]);

      expect(eventBus.emit.calledOnce).to.be.true;
    });

    it("should throw when poll is closed", async () => {
      const poll = makePoll({ isClosed: true });

      (pollRepo as any).findById.resolves(poll);

      try {
        await service.vote(pollId, userId, ["opt-1"]);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should throw when selecting multiple options for single-choice poll", async () => {
      const poll = makePoll({ isMultipleChoice: false });

      (pollRepo as any).findById.resolves(poll);

      try {
        await service.vote(pollId, userId, ["opt-1", "opt-2"]);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should throw when option ID is invalid", async () => {
      const poll = makePoll();

      (pollRepo as any).findById.resolves(poll);

      try {
        await service.vote(pollId, userId, ["invalid-opt"]);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should throw NotFoundException when poll not found", async () => {
      (pollRepo as any).findById.resolves(null);

      try {
        await service.vote(pollId, userId, ["opt-1"]);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  describe("retractVote", () => {
    it("should remove votes and emit event", async () => {
      const poll = makePoll();

      (pollRepo as any).findById.resolves(poll);

      await service.retractVote(pollId, userId);

      expect((voteRepo as any).deleteByPollAndUser.calledOnceWith(pollId, userId)).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
    });

    it("should throw when poll is closed", async () => {
      const poll = makePoll({ isClosed: true });

      (pollRepo as any).findById.resolves(poll);

      try {
        await service.retractVote(pollId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });
  });

  describe("closePoll", () => {
    it("should close the poll when the creator calls it", async () => {
      const poll = makePoll();

      (pollRepo as any).findById.resolves(poll);
      pollRepo.save.resolves(poll);

      await service.closePoll(pollId, userId);

      expect(poll.isClosed).to.be.true;
      expect(poll.closedAt).to.be.instanceOf(Date);
      expect(pollRepo.save.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
    });

    it("should throw ForbiddenException when non-creator tries to close", async () => {
      const poll = makePoll({ message: { id: "msg-1", chatId, senderId: "other-user" } });

      (pollRepo as any).findById.resolves(poll);

      try {
        await service.closePoll(pollId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("should throw BadRequestException when poll is already closed", async () => {
      const poll = makePoll({ isClosed: true });

      (pollRepo as any).findById.resolves(poll);

      try {
        await service.closePoll(pollId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });
  });

  describe("getPollById", () => {
    it("should return poll with results", async () => {
      const poll = makePoll();

      (pollRepo as any).findById.resolves(poll);

      const result = await service.getPollById(pollId, userId);

      expect(result).to.have.property("id", pollId);
      expect(result).to.have.property("question", "Favorite color?");
      expect(result.options).to.have.length(2);
    });

    it("should throw NotFoundException when poll not found", async () => {
      (pollRepo as any).findById.resolves(null);

      try {
        await service.getPollById(pollId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });
});

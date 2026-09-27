import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "../../core/http";
import {
  createMockEventBus,
  createMockFileStorage,
  createMockJobQueue,
  createMockRepository,
  uuid,
  uuid2,
  uuid3,
} from "../../test/helpers";
import { FileUrlService } from "../file";
import { CALL_RINGING_TIMEOUT_QUEUE, CallService } from "./call.service";
import { ECallStatus, ECallType } from "./call.types";
import {
  CallAnsweredEvent,
  CallDeclinedEvent,
  CallEndedEvent,
  CallInitiatedEvent,
  CallMissedEvent,
} from "./events";

const expectRejects = async (
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

describe("CallService", () => {
  let service: CallService;
  let callRepo: any;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let userRepo: any;
  let userBlock: { isBlockedEither: sinon.SinonStub };
  let chatRepo: any;
  let txManager: { query: sinon.SinonStub; getRepository: sinon.SinonStub };
  let txRepo: any;
  let jobs: ReturnType<typeof createMockJobQueue>;

  const callerId = uuid();
  const calleeId = uuid2();
  const callId = uuid3();
  const chatId = "00000000-0000-0000-0000-00000000000c";

  const makeCall = (overrides: Record<string, unknown> = {}) => ({
    id: callId,
    callerId,
    calleeId,
    chatId: null,
    type: ECallType.VOICE,
    status: ECallStatus.RINGING,
    ringingTimeoutAt: new Date(Date.now() + 60_000),
    startedAt: null,
    endedAt: null,
    duration: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    caller: { id: callerId, profile: { firstName: "John" } },
    callee: { id: calleeId, profile: { firstName: "Jane" } },
    ...overrides,
  });

  beforeEach(() => {
    callRepo = createMockRepository();
    eventBus = createMockEventBus();

    callRepo.findById = sinon.stub().resolves(null);
    callRepo.findActiveCalls = sinon.stub().resolves([]);
    callRepo.findCallHistory = sinon.stub().resolves([[], 0]);
    callRepo.transitionStatus = sinon.stub().resolves(true);
    callRepo.expireRinging = sinon.stub().resolves([]);

    userRepo = createMockRepository();
    userRepo.findById = sinon.stub().resolves({ id: calleeId });
    userBlock = { isBlockedEither: sinon.stub().resolves(false) };
    chatRepo = createMockRepository();
    chatRepo.findDirectChat = sinon.stub().resolves({ id: chatId });

    txRepo = createMockRepository();
    txRepo.create = sinon
      .stub()
      .callsFake((data: any) => ({ id: callId, ...data }));
    txRepo.save = sinon.stub().callsFake((data: any) => Promise.resolve(data));
    txManager = {
      query: sinon.stub().resolves([]),
      getRepository: sinon.stub().returns(txRepo),
    };

    const mockDataSource = {
      transaction: sinon.stub().callsFake((cb: any) => cb(txManager)),
    };

    jobs = createMockJobQueue();
    service = new CallService(
      callRepo,
      eventBus as any,
      mockDataSource as any,
      userRepo,
      userBlock as any,
      chatRepo,
      jobs as any,
      new FileUrlService(createMockFileStorage() as any),
    );
  });

  afterEach(() => sinon.restore());

  describe("initiateCall", () => {
    it("создаёт RINGING-звонок с таймаутом и direct-чатом пары", async () => {
      callRepo.findById.resolves(makeCall({ chatId }));

      const result = await service.initiateCall(callerId, { calleeId });

      const created = txRepo.create.firstCall.args[0];

      expect(created.status).to.equal(ECallStatus.RINGING);
      expect(created.chatId).to.equal(chatId);
      expect(created.ringingTimeoutAt).to.be.instanceOf(Date);
      expect(created.ringingTimeoutAt.getTime()).to.be.greaterThan(Date.now());
      expect(chatRepo.findDirectChat.calledOnceWith(callerId, calleeId)).to.be
        .true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        CallInitiatedEvent,
      );
      expect(result).to.have.property("id", callId);
    });

    it("ставит таймаут RINGING отложенной задачей в транзакции звонка", async () => {
      callRepo.findById.resolves(makeCall());

      await service.initiateCall(callerId, { calleeId });

      const created = txRepo.create.firstCall.args[0];
      const [queue, data, options] = jobs.enqueue.firstCall.args;

      expect(queue).to.equal(CALL_RINGING_TIMEOUT_QUEUE);
      expect(data).to.deep.equal({ callId });
      expect(options.startAfter).to.equal(created.ringingTimeoutAt);
      expect(options.singletonKey).to.equal(`call:${callId}`);
      expect(options.manager).to.equal(txManager);
    });

    it("звонок не создан — задача не ставится", async () => {
      userBlock.isBlockedEither.resolves(true);

      await service.initiateCall(callerId, { calleeId }).catch(() => null);

      expect(jobs.enqueue.called).to.be.false;
    });

    it("без direct-чата звонок создаётся с chatId = null", async () => {
      chatRepo.findDirectChat.resolves(null);
      callRepo.findById.resolves(makeCall());

      await service.initiateCall(callerId, { calleeId });

      expect(txRepo.create.firstCall.args[0].chatId).to.be.null;
    });

    it("берёт advisory-lock на обоих участников в детерминированном порядке", async () => {
      callRepo.findById.resolves(makeCall());
      userRepo.findById.resolves({ id: callerId });

      await service.initiateCall(calleeId, { calleeId: callerId });

      const locks = txManager.query
        .getCalls()
        .filter(c => String(c.args[0]).includes("pg_advisory_xact_lock"));

      expect(locks).to.have.length(2);
      expect(locks[0].args[1][1]).to.equal(callerId);
      expect(locks[1].args[1][1]).to.equal(calleeId);
      expect(txManager.query.calledBefore(txRepo.find)).to.be.true;
    });

    it("404, если callee не существует", async () => {
      userRepo.findById.resolves(null);

      await expectRejects(
        service.initiateCall(callerId, { calleeId }),
        NotFoundException,
      );
      expect(txRepo.create.called).to.be.false;
    });

    it("403, если между пользователями блокировка", async () => {
      userBlock.isBlockedEither.resolves(true);

      await expectRejects(
        service.initiateCall(callerId, { calleeId }),
        ForbiddenException,
      );
      expect(userBlock.isBlockedEither.calledOnceWith(callerId, calleeId)).to.be
        .true;
      expect(txRepo.create.called).to.be.false;
    });

    it("409, если у кого-то из пары уже есть активный звонок", async () => {
      txRepo.find = sinon.stub().resolves([makeCall()]);

      await expectRejects(
        service.initiateCall(callerId, { calleeId }),
        ConflictException,
      );
      expect(txRepo.create.called).to.be.false;
    });

    it("занят вызывающий — CALL_ALREADY_IN_CALL, занят вызываемый — CALL_BUSY", async () => {
      txRepo.find = sinon.stub().resolves([makeCall()]);

      const own = await service
        .initiateCall(callerId, { calleeId })
        .catch(e => e);

      txRepo.find = sinon
        .stub()
        .resolves([makeCall({ callerId: "someone", calleeId })]);

      const peer = await service
        .initiateCall(callerId, { calleeId })
        .catch(e => e);

      expect(own).to.have.property("code", "CALL_ALREADY_IN_CALL");
      expect(peer).to.have.property("code", "CALL_BUSY");
      expect(peer).to.have.property("status", 409);
    });

    it("400 при звонке самому себе", async () => {
      await expectRejects(
        service.initiateCall(callerId, { calleeId: callerId }),
        BadRequestException,
      );
    });
  });

  describe("answerCall", () => {
    it("атомарно переводит RINGING → ACTIVE", async () => {
      callRepo.findById.resolves(makeCall());

      await service.answerCall(callId, calleeId);

      const [id, from, patch] = callRepo.transitionStatus.firstCall.args;

      expect(id).to.equal(callId);
      expect(from).to.deep.equal([ECallStatus.RINGING]);
      expect(patch.status).to.equal(ECallStatus.ACTIVE);
      expect(patch.startedAt).to.be.instanceOf(Date);
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        CallAnsweredEvent,
      );
    });

    it("409, если звонок успел смениться (гонка с таймаутом)", async () => {
      callRepo.findById.resolves(makeCall());
      callRepo.transitionStatus.resolves(false);

      await expectRejects(
        service.answerCall(callId, calleeId),
        ConflictException,
      );
      expect(eventBus.emit.called).to.be.false;
    });

    it("409, если время ожидания истекло", async () => {
      callRepo.findById.resolves(
        makeCall({ ringingTimeoutAt: new Date(Date.now() - 1000) }),
      );

      await expectRejects(
        service.answerCall(callId, calleeId),
        ConflictException,
      );
      expect(callRepo.transitionStatus.called).to.be.false;
    });

    it("403 для не-callee", async () => {
      callRepo.findById.resolves(makeCall());

      await expectRejects(
        service.answerCall(callId, callerId),
        ForbiddenException,
      );
    });

    it("409, если звонок не RINGING", async () => {
      callRepo.findById.resolves(makeCall({ status: ECallStatus.ACTIVE }));

      await expectRejects(
        service.answerCall(callId, calleeId),
        ConflictException,
      );
    });

    it("404, если звонка нет", async () => {
      await expectRejects(
        service.answerCall(callId, calleeId),
        NotFoundException,
      );
    });
  });

  describe("declineCall", () => {
    it("callee отклоняет → DECLINED", async () => {
      callRepo.findById.resolves(makeCall());

      await service.declineCall(callId, calleeId);

      expect(callRepo.transitionStatus.firstCall.args[2].status).to.equal(
        ECallStatus.DECLINED,
      );
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        CallDeclinedEvent,
      );
    });

    it("caller отменяет → MISSED", async () => {
      callRepo.findById.resolves(makeCall());

      await service.declineCall(callId, callerId);

      expect(callRepo.transitionStatus.firstCall.args[2].status).to.equal(
        ECallStatus.MISSED,
      );
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(CallMissedEvent);
    });

    it("403 для не участника", async () => {
      callRepo.findById.resolves(makeCall());

      await expectRejects(
        service.declineCall(callId, "other-user"),
        ForbiddenException,
      );
    });
  });

  describe("endCall", () => {
    it("ACTIVE → ENDED с длительностью", async () => {
      callRepo.findById.resolves(
        makeCall({
          status: ECallStatus.ACTIVE,
          startedAt: new Date(Date.now() - 60_000),
        }),
      );

      await service.endCall(callId, callerId);

      const [, from, patch] = callRepo.transitionStatus.firstCall.args;

      expect(from).to.deep.equal([ECallStatus.ACTIVE]);
      expect(patch.status).to.equal(ECallStatus.ENDED);
      expect(patch.duration).to.be.at.least(59);
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(CallEndedEvent);
    });

    it("RINGING, завершает caller → MISSED без duration", async () => {
      callRepo.findById.resolves(makeCall());

      await service.endCall(callId, callerId);

      const [, from, patch] = callRepo.transitionStatus.firstCall.args;

      expect(from).to.deep.equal([ECallStatus.RINGING]);
      expect(patch.status).to.equal(ECallStatus.MISSED);
      expect(patch.duration).to.be.undefined;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(CallMissedEvent);
    });

    it("RINGING, завершает callee → DECLINED без duration", async () => {
      callRepo.findById.resolves(makeCall());

      await service.endCall(callId, calleeId);

      const patch = callRepo.transitionStatus.firstCall.args[2];

      expect(patch.status).to.equal(ECallStatus.DECLINED);
      expect(patch.duration).to.be.undefined;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        CallDeclinedEvent,
      );
    });

    it("409 при гонке переходов", async () => {
      callRepo.findById.resolves(makeCall({ status: ECallStatus.ACTIVE }));
      callRepo.transitionStatus.resolves(false);

      await expectRejects(service.endCall(callId, callerId), ConflictException);
    });

    it("409, если звонок уже завершён", async () => {
      callRepo.findById.resolves(makeCall({ status: ECallStatus.ENDED }));

      await expectRejects(service.endCall(callId, callerId), ConflictException);
    });

    it("403 для не участника", async () => {
      callRepo.findById.resolves(makeCall({ status: ECallStatus.ACTIVE }));

      await expectRejects(
        service.endCall(callId, "other-user"),
        ForbiddenException,
      );
    });

    it("404, если звонка нет", async () => {
      await expectRejects(service.endCall(callId, callerId), NotFoundException);
    });
  });

  describe("expireRingingCalls", () => {
    it("переводит просроченные в MISSED и шлёт CallMissedEvent", async () => {
      callRepo.expireRinging.resolves([callId]);
      callRepo.findById.resolves(makeCall({ status: ECallStatus.MISSED }));

      const count = await service.expireRingingCalls();

      expect(count).to.equal(1);
      expect(callRepo.expireRinging.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(CallMissedEvent);
    });

    it("ничего не шлёт, если просроченных нет", async () => {
      const count = await service.expireRingingCalls();

      expect(count).to.equal(0);
      expect(eventBus.emit.called).to.be.false;
    });
  });

  describe("expireRingingCall", () => {
    it("переводит один звонок в MISSED и шлёт CallMissedEvent", async () => {
      callRepo.expireRinging.resolves([callId]);
      callRepo.findById.resolves(makeCall({ status: ECallStatus.MISSED }));

      const expired = await service.expireRingingCall(callId);

      expect(expired).to.be.true;
      expect(callRepo.expireRinging.firstCall.args[1]).to.equal(callId);
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(CallMissedEvent);
    });

    it("звонок уже отвечен — ничего не делает", async () => {
      const expired = await service.expireRingingCall(callId);

      expect(expired).to.be.false;
      expect(eventBus.emit.called).to.be.false;
    });
  });

  describe("getCallHistory", () => {
    it("возвращает страницу", async () => {
      callRepo.findCallHistory.resolves([[makeCall()], 1]);

      const result = await service.getCallHistory(callerId, 0, 10);

      expect(result).to.include({ total: 1, offset: 0, limit: 10 });
      expect(result.items).to.have.length(1);
      expect(callRepo.findCallHistory.calledOnceWith(callerId, 0, 10)).to.be
        .true;
    });

    it("использует offset/limit по умолчанию", async () => {
      await service.getCallHistory(callerId);

      expect(callRepo.findCallHistory.calledOnceWith(callerId, 0, 20)).to.be
        .true;
    });
  });

  describe("getActiveCall", () => {
    it("возвращает активный звонок", async () => {
      callRepo.findActiveCalls.resolves([
        makeCall({ status: ECallStatus.ACTIVE }),
      ]);

      const result = await service.getActiveCall(callerId);

      expect(result!.id).to.equal(callId);
    });

    it("null без активного звонка", async () => {
      expect(await service.getActiveCall(callerId)).to.be.null;
    });
  });
});

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
import { CallService } from "./call.service";
import { ECallStatus, ECallType } from "./call.types";

describe("CallService", () => {
  let service: CallService;
  let callRepo: ReturnType<typeof createMockRepository>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let sandbox: sinon.SinonSandbox;

  const callerId = uuid();
  const calleeId = uuid2();
  const callId = uuid3();

  const makeCall = (overrides: Record<string, unknown> = {}) => ({
    id: callId,
    callerId,
    calleeId,
    chatId: null,
    type: ECallType.VOICE,
    status: ECallStatus.RINGING,
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
    sandbox = sinon.createSandbox();
    callRepo = createMockRepository();
    eventBus = createMockEventBus();

    (callRepo as any).findById = sinon.stub().resolves(null);
    (callRepo as any).findActiveCalls = sinon.stub().resolves([]);
    (callRepo as any).findCallHistory = sinon.stub().resolves([[], 0]);

    const mockQb: any = {};
    const qbMethods = ["setLock", "where", "andWhere"];

    for (const m of qbMethods) {
      mockQb[m] = sinon.stub().returns(mockQb);
    }
    mockQb.getMany = sinon.stub().resolves([]);

    const mockTxRepo = {
      createQueryBuilder: sinon.stub().returns(mockQb),
      create: sinon.stub().callsFake((data: any) => ({ id: callId, ...data })),
      save: sinon.stub().callsFake((data: any) => Promise.resolve(data)),
    };

    const mockDataSource = {
      transaction: sinon.stub().callsFake((cb: any) => cb({ getRepository: sinon.stub().returns(mockTxRepo) })),
    };

    service = new CallService(callRepo as any, eventBus as any, mockDataSource as any);
  });

  afterEach(() => sandbox.restore());

  describe("initiateCall", () => {
    it("should create a call with RINGING status", async () => {
      const call = makeCall();

      (callRepo as any).findById.resolves(call);

      const result = await service.initiateCall(callerId, { calleeId });

      expect(eventBus.emit.calledOnce).to.be.true;
      expect(result).to.have.property("id", callId);
    });

    it("should throw when caller already has an active call", async () => {
      // Override the transaction mock to make the first getMany return active calls
      const mockQb2: any = {};
      const qbMethods2 = ["setLock", "where", "andWhere"];

      for (const m of qbMethods2) {
        mockQb2[m] = sinon.stub().returns(mockQb2);
      }
      mockQb2.getMany = sinon.stub().resolves([makeCall()]);

      const mockTxRepo2 = {
        createQueryBuilder: sinon.stub().returns(mockQb2),
        create: sinon.stub().callsFake((data: any) => ({ id: callId, ...data })),
        save: sinon.stub().callsFake((data: any) => Promise.resolve(data)),
      };

      service = new CallService(callRepo as any, eventBus as any, {
        transaction: sinon.stub().callsFake((cb: any) => cb({ getRepository: sinon.stub().returns(mockTxRepo2) })),
      } as any);

      try {
        await service.initiateCall(callerId, { calleeId });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should throw when callee already has an active call", async () => {
      // First query (caller) returns empty, second query (callee) returns active call
      const mockQb3: any = {};
      const qbMethods3 = ["setLock", "where", "andWhere"];

      for (const m of qbMethods3) {
        mockQb3[m] = sinon.stub().returns(mockQb3);
      }
      mockQb3.getMany = sinon.stub()
        .onFirstCall().resolves([])
        .onSecondCall().resolves([makeCall()]);

      const mockTxRepo3 = {
        createQueryBuilder: sinon.stub().returns(mockQb3),
        create: sinon.stub().callsFake((data: any) => ({ id: callId, ...data })),
        save: sinon.stub().callsFake((data: any) => Promise.resolve(data)),
      };

      service = new CallService(callRepo as any, eventBus as any, {
        transaction: sinon.stub().callsFake((cb: any) => cb({ getRepository: sinon.stub().returns(mockTxRepo3) })),
      } as any);

      try {
        await service.initiateCall(callerId, { calleeId });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should throw when calling yourself", async () => {
      try {
        await service.initiateCall(callerId, { calleeId: callerId });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });
  });

  describe("answerCall", () => {
    it("should set ACTIVE status and startedAt when RINGING", async () => {
      const call = makeCall({ status: ECallStatus.RINGING });

      (callRepo as any).findById.resolves(call);
      callRepo.save.resolves(call);

      await service.answerCall(callId, calleeId);

      expect(call.status).to.equal(ECallStatus.ACTIVE);
      expect(call.startedAt).to.be.instanceOf(Date);
      expect(callRepo.save.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
    });

    it("should throw ForbiddenException when wrong user tries to answer", async () => {
      const call = makeCall();

      (callRepo as any).findById.resolves(call);

      try {
        await service.answerCall(callId, "other-user");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("should throw BadRequestException when call is not RINGING", async () => {
      const call = makeCall({ status: ECallStatus.ACTIVE });

      (callRepo as any).findById.resolves(call);

      try {
        await service.answerCall(callId, calleeId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should throw NotFoundException when call not found", async () => {
      (callRepo as any).findById.resolves(null);

      try {
        await service.answerCall(callId, calleeId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  describe("declineCall", () => {
    it("should set DECLINED status when callee declines", async () => {
      const call = makeCall({ status: ECallStatus.RINGING });

      (callRepo as any).findById.resolves(call);
      callRepo.save.resolves(call);

      await service.declineCall(callId, calleeId);

      expect(call.status).to.equal(ECallStatus.DECLINED);
      expect(call.endedAt).to.be.instanceOf(Date);
      expect(eventBus.emit.calledOnce).to.be.true;
    });

    it("should set MISSED status when caller cancels", async () => {
      const call = makeCall({ status: ECallStatus.RINGING });

      (callRepo as any).findById.resolves(call);
      callRepo.save.resolves(call);

      await service.declineCall(callId, callerId);

      expect(call.status).to.equal(ECallStatus.MISSED);
      expect(eventBus.emit.calledOnce).to.be.true;
    });

    it("should throw ForbiddenException when not a participant", async () => {
      const call = makeCall();

      (callRepo as any).findById.resolves(call);

      try {
        await service.declineCall(callId, "other-user");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });
  });

  describe("endCall", () => {
    it("should set ENDED status and calculate duration", async () => {
      const startedAt = new Date(Date.now() - 60000); // 60 seconds ago
      const call = makeCall({ status: ECallStatus.ACTIVE, startedAt });

      (callRepo as any).findById.resolves(call);
      callRepo.save.resolves(call);

      await service.endCall(callId, callerId);

      expect(call.status).to.equal(ECallStatus.ENDED);
      expect(call.endedAt).to.be.instanceOf(Date);
      expect(call.duration).to.be.a("number");
      expect(call.duration).to.be.at.least(59);
      expect(eventBus.emit.calledOnce).to.be.true;
    });

    it("should throw BadRequestException when call already ended", async () => {
      const call = makeCall({ status: ECallStatus.ENDED });

      (callRepo as any).findById.resolves(call);

      try {
        await service.endCall(callId, callerId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should throw ForbiddenException when not a participant", async () => {
      const call = makeCall({ status: ECallStatus.ACTIVE });

      (callRepo as any).findById.resolves(call);

      try {
        await service.endCall(callId, "other-user");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("should throw NotFoundException when call not found", async () => {
      (callRepo as any).findById.resolves(null);

      try {
        await service.endCall(callId, callerId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  describe("getCallHistory", () => {
    it("should return paginated list", async () => {
      const calls = [makeCall()];

      (callRepo as any).findCallHistory.resolves([calls, 1]);

      const result = await service.getCallHistory(callerId, 10, 0);

      expect(result.totalCount).to.equal(1);
      expect(result.data).to.have.length(1);
      expect((callRepo as any).findCallHistory.calledOnceWith(callerId, 10, 0)).to.be.true;
    });

    it("should use default limit and offset", async () => {
      (callRepo as any).findCallHistory.resolves([[], 0]);

      await service.getCallHistory(callerId);

      expect((callRepo as any).findCallHistory.calledOnceWith(callerId, 50, 0)).to.be.true;
    });
  });

  describe("getActiveCall", () => {
    it("should return active call when exists", async () => {
      const call = makeCall({ status: ECallStatus.ACTIVE });

      (callRepo as any).findActiveCalls.resolves([call]);

      const result = await service.getActiveCall(callerId);

      expect(result).to.not.be.null;
      expect(result!.id).to.equal(callId);
    });

    it("should return null when no active call", async () => {
      (callRepo as any).findActiveCalls.resolves([]);

      const result = await service.getActiveCall(callerId);

      expect(result).to.be.null;
    });
  });
});

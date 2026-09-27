import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "../../core/http";
import {
  createMockEventBus,
  createMockFileStorage,
  createMockRepository,
  uuid,
  uuid2,
  uuid3,
} from "../../test/helpers";
import { FileUrlService } from "../file";
import { ChatService } from "./chat.service";
import { EChatMemberRole, EChatType } from "./chat.types";
import {
  ChatCreatedEvent,
  ChatDeletedEvent,
  ChatMemberRoleChangedEvent,
} from "./events";

type TStubbed = ReturnType<typeof createMockRepository> &
  Record<string, sinon.SinonStub>;

const expectReject = async (
  promise: Promise<unknown>,
  ErrorClass: new (...args: any[]) => Error,
) => {
  try {
    await promise;
  } catch (err) {
    expect(err).to.have.property("status", (new ErrorClass() as any).status);

    return;
  }
  expect.fail(`Ожидалось исключение ${ErrorClass.name}`);
};

describe("ChatService — бизнес-правила", () => {
  let service: ChatService;
  let chatRepo: TStubbed;
  let memberRepo: TStubbed;
  let inviteRepo: TStubbed;
  let folderRepo: TStubbed;
  let banRepo: TStubbed;
  let userBlock: { isBlockedEither: sinon.SinonStub };
  let eventBus: ReturnType<typeof createMockEventBus>;
  let transaction: sinon.SinonStub;

  const userId = uuid();
  const otherId = uuid2();
  const chatId = uuid3();
  const manager = { tx: true };

  const makeChat = (overrides: Record<string, unknown> = {}) => ({
    id: chatId,
    type: EChatType.GROUP,
    name: "Chat",
    description: null,
    username: null,
    isPublic: false,
    avatar: null,
    createdById: userId,
    slowModeSeconds: 0,
    lastMessageAt: null,
    lastMessageId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    members: [],
    ...overrides,
  });

  const makeMember = (overrides: Record<string, unknown> = {}) => ({
    id: "m-1",
    chatId,
    userId,
    role: EChatMemberRole.MEMBER,
    joinedAt: new Date(),
    mutedUntil: null,
    lastReadMessageId: null,
    isPinnedChat: false,
    pinnedChatAt: null,
    folderId: null,
    hiddenAt: null,
    ...overrides,
  });

  const memberships = (map: Record<string, EChatMemberRole | null>) =>
    memberRepo.findMembership.callsFake(async (_c: string, uid: string) =>
      map[uid] ? makeMember({ userId: uid, role: map[uid] }) : null,
    );

  beforeEach(() => {
    chatRepo = createMockRepository() as TStubbed;
    memberRepo = createMockRepository() as TStubbed;
    inviteRepo = createMockRepository() as TStubbed;
    folderRepo = createMockRepository() as TStubbed;
    banRepo = createMockRepository() as TStubbed;
    userBlock = { isBlockedEither: sinon.stub().resolves(false) };
    eventBus = createMockEventBus();
    transaction = sinon.stub().callsFake((cb: any) => cb(manager));

    chatRepo.findById = sinon.stub().resolves(makeChat());
    chatRepo.findByIdLight = sinon.stub().resolves(makeChat());
    chatRepo.findDirectChat = sinon.stub().resolves(null);
    chatRepo.insertDirectChat = sinon.stub().resolves(chatId);
    chatRepo.findPublicChannels = sinon.stub().resolves([[], 0]);

    memberRepo.findMembership = sinon.stub().resolves(null);
    memberRepo.findMembershipWithProfile = sinon.stub().resolves(makeMember());
    memberRepo.insertIgnore = sinon
      .stub()
      .callsFake(async (rows: Array<{ userId: string }>) =>
        rows.map(r => r.userId),
      );
    memberRepo.findExistingUserIds = sinon
      .stub()
      .callsFake(async (ids: string[]) => ids);
    memberRepo.getMemberUserIds = sinon.stub().resolves([userId]);
    memberRepo.countMembers = sinon.stub().resolves(1);
    memberRepo.findPreviewMembers = sinon.stub().resolves([]);
    memberRepo.countByChatIds = sinon.stub().resolves({});
    memberRepo.findMembershipsWithProfile = sinon.stub().resolves([]);
    memberRepo.findChatMembersPaged = sinon.stub().resolves([[], 0]);
    memberRepo.hideMembership = sinon.stub().resolves();
    memberRepo.unhideMembership = sinon.stub().resolves();
    memberRepo.setRole = sinon.stub().resolves();
    memberRepo.findOwnedMemberships = sinon.stub().resolves([]);
    memberRepo.findOwnershipCandidate = sinon.stub().resolves(null);

    inviteRepo.findByCode = sinon.stub().resolves(null);
    inviteRepo.consumeUse = sinon.stub().resolves(true);

    folderRepo.findByUserAndName = sinon.stub().resolves(null);

    banRepo.findActiveBan = sinon.stub().resolves(null);
    banRepo.findActiveBannedUserIds = sinon.stub().resolves([]);

    chatRepo.findOrphanChatIds = sinon.stub().resolves([]);
    chatRepo.findChatIdsWithoutOwner = sinon.stub().resolves([]);

    service = new ChatService(
      chatRepo as any,
      memberRepo as any,
      inviteRepo as any,
      folderRepo as any,
      eventBus as any,
      { transaction } as any,
      banRepo as any,
      userBlock as any,
      new FileUrlService(createMockFileStorage() as any),
    );
  });

  describe("баны", () => {
    const invite = (overrides: Record<string, unknown> = {}) => ({
      id: "inv-1",
      chatId,
      code: "code",
      isActive: true,
      expiresAt: null,
      maxUses: null,
      useCount: 0,
      ...overrides,
    });

    it("joinByInvite отклоняет забаненного (403)", async () => {
      inviteRepo.findByCode.resolves(invite());
      banRepo.findActiveBan.resolves({ id: "ban" });

      await expectReject(
        service.joinByInvite("code", otherId),
        ForbiddenException,
      );
      expect(memberRepo.insertIgnore.called).to.be.false;
    });

    it("subscribeToChannel отклоняет забаненного (403)", async () => {
      chatRepo.findByIdLight.resolves(
        makeChat({ type: EChatType.CHANNEL, isPublic: true }),
      );
      banRepo.findActiveBan.resolves({ id: "ban" });

      await expectReject(
        service.subscribeToChannel(chatId, otherId),
        ForbiddenException,
      );
    });

    it("addMembers отклоняет забаненного (403)", async () => {
      memberships({ [userId]: EChatMemberRole.OWNER });
      banRepo.findActiveBannedUserIds.resolves([otherId]);

      await expectReject(
        service.addMembers(chatId, userId, [otherId]),
        ForbiddenException,
      );
      expect(memberRepo.insertIgnore.called).to.be.false;
    });
  });

  describe("блокировки и существование пользователей", () => {
    it("createDirectChat с заблокировавшим — 403", async () => {
      userBlock.isBlockedEither.resolves(true);

      await expectReject(
        service.createDirectChat(userId, otherId),
        ForbiddenException,
      );
    });

    it("addMembers с заблокированным — 403", async () => {
      memberships({ [userId]: EChatMemberRole.OWNER });
      userBlock.isBlockedEither.resolves(true);

      await expectReject(
        service.addMembers(chatId, userId, [otherId]),
        ForbiddenException,
      );
    });

    it("addMembers с несуществующим пользователем — 400", async () => {
      memberships({ [userId]: EChatMemberRole.OWNER });
      memberRepo.findExistingUserIds.resolves([]);

      await expectReject(
        service.addMembers(chatId, userId, [otherId]),
        BadRequestException,
      );
    });

    it("createGroupChat с несуществующим пользователем — 400", async () => {
      memberRepo.findExistingUserIds.resolves([]);

      await expectReject(
        service.createGroupChat(userId, "G", [otherId]),
        BadRequestException,
      );
      expect(transaction.called).to.be.false;
    });

    it("createDirectChat с несуществующим пользователем — 400", async () => {
      memberRepo.findExistingUserIds.resolves([]);

      await expectReject(
        service.createDirectChat(userId, otherId),
        BadRequestException,
      );
    });
  });

  describe("direct-чат", () => {
    it("гонка создания: ON CONFLICT → перечитывание без ChatCreatedEvent", async () => {
      chatRepo.insertDirectChat.resolves(null);
      chatRepo.findDirectChat
        .onFirstCall()
        .resolves(null)
        .onSecondCall()
        .resolves({ id: chatId });

      const dto = await service.createDirectChat(userId, otherId);

      expect(dto.id).to.equal(chatId);
      expect(memberRepo.insertIgnore.called).to.be.false;
      expect(
        eventBus.emit
          .getCalls()
          .some(c => c.args[0] instanceof ChatCreatedEvent),
      ).to.be.false;
    });

    it("новый direct-чат создаётся с direct_key пары", async () => {
      await service.createDirectChat(otherId, userId);

      expect(chatRepo.insertDirectChat.firstCall.args[0]).to.equal(
        [userId, otherId].sort().join(":"),
      );
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        ChatCreatedEvent,
      );
    });

    it("существующий direct-чат снова показывается инициатору", async () => {
      chatRepo.findDirectChat.resolves({ id: chatId });

      await service.createDirectChat(userId, otherId);

      expect(memberRepo.unhideMembership.calledWith(chatId, userId)).to.be.true;
    });

    it("выход из direct-чата скрывает его, членство сохраняется", async () => {
      chatRepo.findByIdLight.resolves(makeChat({ type: EChatType.DIRECT }));
      memberships({ [userId]: EChatMemberRole.MEMBER });

      await service.leaveChat(chatId, userId);

      expect(memberRepo.hideMembership.calledWith(chatId, userId)).to.be.true;
      expect(memberRepo.delete.called).to.be.false;
    });
  });

  describe("роли", () => {
    it("updateMemberRole: нельзя менять свою роль", async () => {
      memberships({ [userId]: EChatMemberRole.OWNER });

      await expectReject(
        service.updateMemberRole(chatId, userId, userId, EChatMemberRole.ADMIN),
        BadRequestException,
      );
    });

    it("updateMemberRole: OWNER назначается только передачей владения", async () => {
      memberships({
        [userId]: EChatMemberRole.OWNER,
        [otherId]: EChatMemberRole.MEMBER,
      });

      await expectReject(
        service.updateMemberRole(
          chatId,
          userId,
          otherId,
          EChatMemberRole.OWNER,
        ),
        BadRequestException,
      );
    });

    it("updateMemberRole: SUBSCRIBER недопустим в группе", async () => {
      memberships({
        [userId]: EChatMemberRole.OWNER,
        [otherId]: EChatMemberRole.MEMBER,
      });

      await expectReject(
        service.updateMemberRole(
          chatId,
          userId,
          otherId,
          EChatMemberRole.SUBSCRIBER,
        ),
        BadRequestException,
      );
    });

    it("updateMemberRole: MEMBER недопустим в канале", async () => {
      chatRepo.findByIdLight.resolves(makeChat({ type: EChatType.CHANNEL }));
      memberships({
        [userId]: EChatMemberRole.OWNER,
        [otherId]: EChatMemberRole.SUBSCRIBER,
      });

      await expectReject(
        service.updateMemberRole(
          chatId,
          userId,
          otherId,
          EChatMemberRole.MEMBER,
        ),
        BadRequestException,
      );
    });

    it("transferOwnership: старый → ADMIN, новый → OWNER в транзакции", async () => {
      memberships({
        [userId]: EChatMemberRole.OWNER,
        [otherId]: EChatMemberRole.MEMBER,
      });

      await service.transferOwnership(chatId, userId, otherId);

      expect(transaction.calledOnce).to.be.true;
      expect(
        memberRepo.setRole.calledWith(
          chatId,
          userId,
          EChatMemberRole.ADMIN,
          manager,
        ),
      ).to.be.true;
      expect(
        memberRepo.setRole.calledWith(
          chatId,
          otherId,
          EChatMemberRole.OWNER,
          manager,
        ),
      ).to.be.true;
      expect(
        eventBus.emit
          .getCalls()
          .filter(c => c.args[0] instanceof ChatMemberRoleChangedEvent),
      ).to.have.length(2);
    });

    it("transferOwnership: не владелец — 403", async () => {
      memberships({
        [userId]: EChatMemberRole.ADMIN,
        [otherId]: EChatMemberRole.MEMBER,
      });

      await expectReject(
        service.transferOwnership(chatId, userId, otherId),
        ForbiddenException,
      );
    });

    it("joinByInvite в канал — роль SUBSCRIBER", async () => {
      inviteRepo.findByCode.resolves({
        id: "inv",
        chatId,
        isActive: true,
        expiresAt: null,
        maxUses: null,
        useCount: 0,
      });
      chatRepo.findByIdLight.resolves(makeChat({ type: EChatType.CHANNEL }));

      await service.joinByInvite("code", otherId);

      expect(memberRepo.insertIgnore.firstCall.args[0][0].role).to.equal(
        EChatMemberRole.SUBSCRIBER,
      );
    });

    it("ADMIN не может удалить другого ADMIN", async () => {
      memberships({
        [userId]: EChatMemberRole.ADMIN,
        [otherId]: EChatMemberRole.ADMIN,
      });

      await expectReject(
        service.removeMember(chatId, userId, otherId),
        ForbiddenException,
      );
    });

    it("OWNER не может уйти, пока есть другие участники (409)", async () => {
      memberships({ [userId]: EChatMemberRole.OWNER });
      memberRepo.countMembers.resolves(3);

      await expectReject(service.leaveChat(chatId, userId), ConflictException);
    });

    it("единственный OWNER уходит — чат удаляется с ChatDeletedEvent", async () => {
      memberships({ [userId]: EChatMemberRole.OWNER });
      memberRepo.countMembers.resolves(1);

      await service.leaveChat(chatId, userId);

      expect(chatRepo.delete.calledWith({ id: chatId })).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        ChatDeletedEvent,
      );
    });
  });

  describe("удаление чата", () => {
    it("владелец удаляет чат — событие ChatDeletedEvent", async () => {
      memberships({ [userId]: EChatMemberRole.OWNER });
      memberRepo.getMemberUserIds.resolves([userId, otherId]);

      await service.deleteChat(chatId, userId);

      expect(chatRepo.delete.calledWith({ id: chatId })).to.be.true;

      const event = eventBus.emit.firstCall.args[0] as ChatDeletedEvent;

      expect(event).to.be.instanceOf(ChatDeletedEvent);
      expect(event.memberUserIds).to.deep.equal([userId, otherId]);
    });

    it("не владелец — 403", async () => {
      memberships({ [userId]: EChatMemberRole.ADMIN });

      await expectReject(
        service.deleteChat(chatId, userId),
        ForbiddenException,
      );
      expect(chatRepo.delete.called).to.be.false;
    });
  });

  describe("инвайты", () => {
    it("лимит исчерпан при атомарном расходе — 400, членство откатывается", async () => {
      inviteRepo.findByCode.resolves({
        id: "inv",
        chatId,
        isActive: true,
        expiresAt: null,
        maxUses: 1,
        useCount: 0,
      });
      inviteRepo.consumeUse.resolves(false);

      await expectReject(
        service.joinByInvite("code", otherId),
        BadRequestException,
      );
      expect(inviteRepo.consumeUse.calledWith("inv", manager)).to.be.true;
      expect(eventBus.emit.called).to.be.false;
    });

    it("createInviteLink: expiresAt в прошлом — 400", async () => {
      memberships({ [userId]: EChatMemberRole.OWNER });

      await expectReject(
        service.createInviteLink(chatId, userId, {
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        }),
        BadRequestException,
      );
      expect(inviteRepo.createAndSave.called).to.be.false;
    });
  });

  describe("удаление пользователя", () => {
    it("владение передаётся кандидату (старейший ADMIN/участник)", async () => {
      memberRepo.findOwnedMemberships.resolves([{ id: "m", chatId }]);
      memberRepo.findOwnershipCandidate.resolves(
        makeMember({ userId: otherId, role: EChatMemberRole.ADMIN }),
      );

      await service.handleUserDeleted(userId);

      expect(memberRepo.findOwnershipCandidate.firstCall.args[1]).to.equal(
        userId,
      );
      expect(
        memberRepo.setRole.calledWith(chatId, otherId, EChatMemberRole.OWNER),
      ).to.be.true;
      expect(chatRepo.delete.called).to.be.false;
    });

    it("чат, где он единственный участник, удаляется", async () => {
      memberRepo.findOwnedMemberships.resolves([{ id: "m", chatId }]);
      memberRepo.findOwnershipCandidate.resolves(null);

      await service.handleUserDeleted(userId);

      expect(chatRepo.delete.calledWith({ id: chatId })).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        ChatDeletedEvent,
      );
    });

    it("зачистка после каскада: чаты без участников удаляются", async () => {
      chatRepo.findOrphanChatIds.resolves([chatId]);

      await service.handleUserDeleted(userId);

      expect(chatRepo.delete.calledWith({ id: chatId })).to.be.true;
    });
  });

  describe("валидация", () => {
    it("updateFolder: дубликат имени — 409", async () => {
      folderRepo.findOne.resolves({ id: "f1", userId, name: "A" });
      folderRepo.findByUserAndName.resolves({ id: "f2", userId, name: "B" });

      await expectReject(
        service.updateFolder(userId, "f1", { name: "B" }),
        ConflictException,
      );
    });

    it("поиск каналов: запрос короче 2 символов — 400", async () => {
      await expectReject(service.getPublicChannels("a"), BadRequestException);
    });

    it("getChatMembers: только для участника, без приватных полей", async () => {
      memberships({ [userId]: EChatMemberRole.MEMBER });
      memberRepo.findChatMembersPaged.resolves([
        [makeMember({ userId: otherId, folderId: "secret" })],
        1,
      ]);

      const result = await service.getChatMembers(chatId, userId, 0, 20);

      expect(result.total).to.equal(1);
      expect(result.items[0]).to.not.have.property("folderId");
    });

    it("getChatMembers: не участник — 403", async () => {
      await expectReject(
        service.getChatMembers(chatId, userId),
        ForbiddenException,
      );
    });
  });
});

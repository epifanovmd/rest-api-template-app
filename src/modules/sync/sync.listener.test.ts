import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { createMockFileStorage } from "../../test/helpers";
import {
  ChatCreatedEvent,
  ChatDeletedEvent,
  ChatFolderChangedEvent,
  ChatMemberBannedEvent,
  ChatMemberLeftEvent,
  ChatMemberRoleChangedEvent,
  ChatMovedToFolderEvent,
  ChatMutedEvent,
  ChatPinnedEvent,
  ChatUpdatedEvent,
} from "../chat/events";
import { EFileStatus, FileUrlService } from "../file";
import { MessageCreatedEvent, MessageUpdatedEvent } from "../message/events";
import {
  MessagePinnedEvent,
  MessageUnpinnedEvent,
} from "../message/events/message-pinned.event";
import {
  PollClosedEvent,
  PollCreatedEvent,
  PollVotedEvent,
} from "../poll/events";
import { SyncListener } from "./sync.listener";
import { ESyncAction, ESyncEntityType } from "./sync.types";

describe("SyncListener", () => {
  const chatId = "00000000-0000-0000-0000-00000000000c";
  const userId = "00000000-0000-0000-0000-000000000001";
  const otherId = "00000000-0000-0000-0000-000000000002";

  let handlers: Map<unknown, (event: unknown) => void>;
  let syncService: { logChange: sinon.SinonStub };
  let memberRepo: { getMemberUserIds: sinon.SinonStub };
  let storage: ReturnType<typeof createMockFileStorage>;

  beforeEach(() => {
    // Presigned-ссылки S3 (STORAGE_DRIVER=s3): подписывает само хранилище.
    storage = createMockFileStorage();
    storage.signedGetUrl.callsFake(
      async (key: string) =>
        `https://bucket.s3.amazonaws.com/${key}?X-Amz-Signature=abc`,
    );

    handlers = new Map();
    syncService = { logChange: sinon.stub().resolves() };
    memberRepo = { getMemberUserIds: sinon.stub().resolves([otherId]) };

    new SyncListener(
      {
        on: (type: unknown, fn: (event: unknown) => void) =>
          handlers.set(type, fn),
      } as any,
      syncService as any,
      memberRepo as any,
      new FileUrlService(storage as any),
    ).register();
  });

  const emit = async (event: object) => {
    const handler = handlers.get(event.constructor);

    expect(handler, event.constructor.name).to.be.a("function");
    handler!(event);
    // обработчики fire-and-forget
    await new Promise(resolve => setImmediate(resolve));
  };

  const calls = () =>
    syncService.logChange.getCalls().map(c => ({
      entityType: c.args[0],
      entityId: c.args[1],
      action: c.args[2],
      opts: c.args[3],
    }));

  const userScopedChatDelete = (target: string) =>
    calls().find(
      c =>
        c.entityType === ESyncEntityType.CHAT &&
        c.action === ESyncAction.DELETE &&
        c.opts.userId === target,
    );

  it("покинувшему чат пишет user-scoped CHAT delete", async () => {
    await emit(new ChatMemberLeftEvent(chatId, userId, [userId, otherId]));

    const del = userScopedChatDelete(userId);

    expect(del).to.exist;
    expect(del!.entityId).to.equal(chatId);
    expect(del!.opts.scopeId ?? null).to.be.null;
    expect(del!.opts.notifyUserIds).to.deep.equal([userId]);
  });

  it("забаненному пишет user-scoped CHAT delete", async () => {
    await emit(new ChatMemberBannedEvent(chatId, userId, otherId));

    expect(userScopedChatDelete(userId)).to.exist;
  });

  it("при удалении чата — CHAT delete каждому бывшему участнику", async () => {
    await emit(new ChatDeletedEvent(chatId, [userId, otherId], userId));

    expect(userScopedChatDelete(userId)).to.exist;
    expect(userScopedChatDelete(otherId)).to.exist;
  });

  it("смена роли — scope-scoped CHAT_MEMBER update с ролью", async () => {
    await emit(
      new ChatMemberRoleChangedEvent(chatId, userId, "admin", otherId),
    );

    const c = calls().find(x => x.entityType === ESyncEntityType.CHAT_MEMBER)!;

    expect(c.action).to.equal(ESyncAction.UPDATE);
    expect(c.entityId).to.equal(`${chatId}:${userId}`);
    expect(c.opts.scopeId).to.equal(chatId);
    expect(c.opts.payload).to.include({ chatId, userId, role: "admin" });
  });

  it("закрепление/открепление сообщения — MESSAGE_PIN create/delete", async () => {
    await emit(new MessagePinnedEvent({ id: "m1" } as any, chatId, userId));
    await emit(new MessageUnpinnedEvent("m1", chatId));

    const pins = calls().filter(
      c => c.entityType === ESyncEntityType.MESSAGE_PIN,
    );

    expect(pins.map(p => p.action)).to.deep.equal([
      ESyncAction.CREATE,
      ESyncAction.DELETE,
    ]);
    expect(pins.every(p => p.entityId === "m1" && p.opts.scopeId === chatId)).to
      .be.true;
  });

  it("закрепление чата в списке — user-scoped CHAT_PIN", async () => {
    await emit(new ChatPinnedEvent(chatId, userId, true));

    const c = calls().find(x => x.entityType === ESyncEntityType.CHAT_PIN)!;

    expect(c.opts.userId).to.equal(userId);
    expect(c.opts.payload).to.deep.equal({ chatId, isPinned: true });
  });

  it("опросы — POLL create/update в scope чата", async () => {
    const poll = { id: "p1", isClosed: false } as any;

    await emit(
      new PollCreatedEvent(poll, { id: "m1" } as any, chatId, [userId]),
    );
    await emit(new PollVotedEvent(poll, chatId, userId));
    await emit(
      new PollClosedEvent({ ...poll, isClosed: true }, chatId, userId),
    );

    const polls = calls().filter(c => c.entityType === ESyncEntityType.POLL);

    expect(polls.map(p => p.action)).to.deep.equal([
      ESyncAction.CREATE,
      ESyncAction.UPDATE,
      ESyncAction.UPDATE,
    ]);
    expect(polls.every(p => p.opts.scopeId === chatId)).to.be.true;
  });

  describe("личные настройки чата (user-scoped)", () => {
    const folderId = "00000000-0000-0000-0000-0000000000f1";

    const only = (type: ESyncEntityType) => {
      const found = calls().filter(c => c.entityType === type);

      expect(found).to.have.length(1);

      return found[0];
    };

    it("мут — CHAT_MUTE update с mutedUntil только владельцу настройки", async () => {
      const until = new Date("2026-10-01T00:00:00.000Z");

      await emit(new ChatMutedEvent(chatId, userId, until));

      const c = only(ESyncEntityType.CHAT_MUTE);

      expect(c.entityId).to.equal(chatId);
      expect(c.action).to.equal(ESyncAction.UPDATE);
      expect(c.opts).to.include({ userId, scopeId: null });
      expect(c.opts.notifyUserIds).to.deep.equal([userId]);
      expect(c.opts.payload).to.deep.equal({
        chatId,
        mutedUntil: "2026-10-01T00:00:00.000Z",
      });
    });

    it("снятие мута — mutedUntil: null", async () => {
      await emit(new ChatMutedEvent(chatId, userId, null));

      expect(only(ESyncEntityType.CHAT_MUTE).opts.payload).to.deep.equal({
        chatId,
        mutedUntil: null,
      });
    });

    it("перенос чата в папку — CHAT_FOLDER_ITEM по chatId", async () => {
      await emit(new ChatMovedToFolderEvent(chatId, userId, folderId));
      await emit(new ChatMovedToFolderEvent(chatId, userId, null));

      const items = calls().filter(
        c => c.entityType === ESyncEntityType.CHAT_FOLDER_ITEM,
      );

      expect(items.map(c => c.opts.payload)).to.deep.equal([
        { chatId, folderId },
        { chatId, folderId: null },
      ]);
      expect(items.every(c => c.entityId === chatId)).to.be.true;
      expect(items.every(c => c.opts.userId === userId)).to.be.true;
    });

    it("папка: created/updated/deleted → CHAT_FOLDER create/update/delete", async () => {
      const folder = { id: folderId, name: "Работа" } as any;

      await emit(
        new ChatFolderChangedEvent(userId, folderId, "created", folder),
      );
      await emit(
        new ChatFolderChangedEvent(userId, folderId, "updated", folder),
      );
      await emit(new ChatFolderChangedEvent(userId, folderId, "deleted", null));

      const folders = calls().filter(
        c => c.entityType === ESyncEntityType.CHAT_FOLDER,
      );

      expect(folders.map(c => c.action)).to.deep.equal([
        ESyncAction.CREATE,
        ESyncAction.UPDATE,
        ESyncAction.DELETE,
      ]);
      expect(folders[0].opts.payload).to.deep.equal(folder);
      expect(folders[2].opts.payload).to.deep.equal({ folderId });
      expect(folders.every(c => c.entityId === folderId)).to.be.true;
      expect(folders.every(c => c.opts.userId === userId)).to.be.true;
    });
  });

  describe("payload с файлами — ссылки из хранилища (s3)", () => {
    const s3Url = (key: string) =>
      `https://bucket.s3.amazonaws.com/${key}?X-Amz-Signature=abc`;
    const file = (id: string) => ({
      id,
      name: `${id}.png`,
      status: EFileStatus.Ready,
      key: `files/${id}/original.png`,
      optimizedKey: null,
      thumbnailKey: `files/${id}/thumb.webp`,
      mediumKey: null,
    });
    const profile = (avatarId: string) => ({
      id: `p-${avatarId}`,
      userId,
      firstName: "Ann",
      lastName: null,
      avatar: file(avatarId),
    });
    const message = () =>
      ({
        id: "m-1",
        chatId,
        senderId: userId,
        sender: { id: userId, profile: profile("av-1") },
        attachments: [{ id: "att-1", fileId: "f-1", file: file("f-1") }],
        reactions: [],
        mentions: [],
      }) as any;
    const chat = () =>
      ({
        id: chatId,
        type: "group",
        avatar: file("c-1"),
        members: [{ id: "cm-1", userId, user: { profile: profile("av-2") } }],
      }) as any;
    const payloadOf = (entityType: ESyncEntityType) =>
      calls().find(c => c.entityType === entityType)!.opts.payload as any;

    it("MessageCreated / MessageUpdated: вложения и аватар автора", async () => {
      await emit(new MessageCreatedEvent(message(), chatId, [otherId]));
      await emit(new MessageUpdatedEvent(message(), chatId));

      for (const call of calls()) {
        const payload = call.opts.payload as any;

        expect(payload.attachments[0].fileUrl).to.equal(
          s3Url("files/f-1/original.png"),
        );
        expect(payload.attachments[0].thumbnailUrl).to.equal(
          s3Url("files/f-1/thumb.webp"),
        );
        expect(payload.sender.avatarUrl).to.equal(
          s3Url("files/av-1/original.png"),
        );
      }
      expect(calls()).to.have.length(2);
      expect(storage.signedGetUrl.called).to.be.true;
    });

    it("ChatCreated / ChatUpdated: аватар чата и участников", async () => {
      await emit(new ChatCreatedEvent(chat(), [userId]));

      const created = payloadOf(ESyncEntityType.CHAT);

      expect(created.avatarUrl).to.equal(s3Url("files/c-1/original.png"));
      expect(created.members[0].profile.avatarUrl).to.equal(
        s3Url("files/av-2/original.png"),
      );

      syncService.logChange.resetHistory();
      await emit(new ChatUpdatedEvent(chat()));

      expect(payloadOf(ESyncEntityType.CHAT).avatarUrl).to.equal(
        s3Url("files/c-1/original.png"),
      );
    });
  });
});

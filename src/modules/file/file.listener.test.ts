import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { EventBus } from "../../core";
import { createMockEmitter } from "../../test/helpers";
import {
  FileDeletedEvent,
  FileProcessedEvent,
  FileUploadedEvent,
} from "./events";
import { FileListener } from "./file.listener";
import { EFileStatus } from "./file.types";

const flush = () => new Promise(resolve => setImmediate(resolve));

describe("FileListener", () => {
  it("file:processed уходит владельцу с DTO файла", async () => {
    const eventBus = new EventBus();
    const emitter = createMockEmitter();
    const dto = { id: "f1", status: EFileStatus.Ready };
    const files = { getFileById: sinon.stub().resolves(dto) };

    new FileListener(eventBus, emitter as any, files as any).register();
    eventBus.emit(new FileProcessedEvent("f1", "u1", EFileStatus.Ready));
    eventBus.emit(new FileProcessedEvent("f2", null, EFileStatus.Ready));
    await flush();

    expect(emitter.toUser.calledOnceWith("u1", "file:processed", dto)).to.equal(
      true,
    );
    expect(files.getFileById.calledOnceWith("f1")).to.equal(true);
  });

  it("файл удалён к моменту отправки — событие не шлётся", async () => {
    const eventBus = new EventBus();
    const emitter = createMockEmitter();
    const files = { getFileById: sinon.stub().rejects(new Error("gone")) };

    new FileListener(eventBus, emitter as any, files as any).register();
    eventBus.emit(new FileProcessedEvent("f1", "u1", EFileStatus.Failed));
    await flush();

    expect(emitter.toUser.called).to.equal(false);
  });

  it("file:uploaded уходит владельцу с DTO — список на других устройствах", async () => {
    const eventBus = new EventBus();
    const emitter = createMockEmitter();
    const dto = { id: "f1", status: EFileStatus.Processing };
    const files = { getFileById: sinon.stub().resolves(dto) };

    new FileListener(eventBus, emitter as any, files as any).register();
    eventBus.emit(new FileUploadedEvent("f1", "u1", "image/png"));
    await flush();

    expect(emitter.toUser.calledOnceWith("u1", "file:uploaded", dto)).to.equal(
      true,
    );
  });

  it("file:deleted уходит владельцу с id файла", async () => {
    const eventBus = new EventBus();
    const emitter = createMockEmitter();
    const files = { getFileById: sinon.stub() };

    new FileListener(eventBus, emitter as any, files as any).register();
    eventBus.emit(new FileDeletedEvent("f1", "u1"));
    eventBus.emit(new FileDeletedEvent("f2", null));
    await flush();

    expect(
      emitter.toUser.calledOnceWith("u1", "file:deleted", { id: "f1" }),
    ).to.equal(true);
  });
});

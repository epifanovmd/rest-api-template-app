import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { ForbiddenException } from "../../core/http";
import { uuid, uuid2 } from "../../test/helpers";
import { ChatMessageController } from "./chat-message.controller";
import { MessageError } from "./message.errors";

describe("ChatMessageController.sendMessage", () => {
  const userId = uuid();
  const chatId = uuid2();

  const makeReq = () => {
    const set = sinon.stub();

    return {
      req: {
        ctx: { request: { user: { userId } }, set },
      } as any,
      set,
    };
  };

  it("slow mode: MESSAGE_SLOW_MODE уходит с заголовком Retry-After", async () => {
    const service = {
      sendMessage: sinon
        .stub()
        .rejects(MessageError.SLOW_MODE({ retryAfter: 17 })),
    };
    const controller = new ChatMessageController(service as any);
    const { req, set } = makeReq();

    const err = await controller
      .sendMessage(req, chatId, { content: "hi" })
      .catch(e => e);

    expect(err).to.have.property("code", "MESSAGE_SLOW_MODE");
    expect(err).to.have.property("status", 429);
    expect(set.calledOnceWith("Retry-After", "17")).to.be.true;
  });

  it("другие ошибки заголовок не трогают", async () => {
    const service = {
      sendMessage: sinon.stub().rejects(new ForbiddenException()),
    };
    const controller = new ChatMessageController(service as any);
    const { req, set } = makeReq();

    await controller.sendMessage(req, chatId, { content: "hi" }).catch(e => e);

    expect(set.called).to.be.false;
  });

  it("успешная отправка заголовок не трогает", async () => {
    const service = { sendMessage: sinon.stub().resolves({ id: "m-1" }) };
    const controller = new ChatMessageController(service as any);
    const { req, set } = makeReq();

    const result = await controller.sendMessage(req, chatId, { content: "hi" });

    expect(result).to.deep.equal({ id: "m-1" });
    expect(set.called).to.be.false;
  });
});

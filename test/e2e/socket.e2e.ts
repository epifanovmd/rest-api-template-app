import { expect } from "chai";

import { Actor, call, expectStatus, signInAdmin, signUp } from "./client";
import { connectSocket } from "./socket";

/** Комнаты списков: вход только с правом просмотра. */
const LIST_ROOMS = ["users", "roles", "api-keys", "audit"];

describe("сокеты", () => {
  let admin: Actor;

  before(async () => {
    admin = await signInAdmin();
  });

  it("подписка на комнату сразу после подключения получает ответ", async () => {
    // Клиент (и переподключение) шлёт room:subscribe сразу по connect —
    // сервер ещё регистрирует соединение в Redis; запрос не должен теряться.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ws = await connectSocket(admin);

      try {
        expect(
          await ws.join("job", "00000000-0000-4000-8000-000000000000"),
        ).to.deep.equal({ ok: false });
      } finally {
        ws.close();
      }
    }
  });

  it("неизвестный тип комнаты — отказ, комната не раскрывается", async () => {
    const ws = await connectSocket(admin);

    try {
      expect(await ws.join("no-such-room", "x")).to.deep.equal({ ok: false });
    } finally {
      ws.close();
    }
  });

  it("комнаты списков — только с правом", async () => {
    const ws = await connectSocket(admin);
    const user = await signUp("ws-stranger");
    const stranger = await connectSocket(user);

    try {
      for (const type of LIST_ROOMS) {
        expect(await ws.join(type), type).to.deep.equal({ ok: true });
        expect(await stranger.join(type), type).to.deep.equal({ ok: false });
      }
    } finally {
      ws.close();
      stranger.close();
    }
  });

  it("список пользователей живой: user:updated при смене прав", async () => {
    const ws = await connectSocket(admin);
    const target = await signUp("ws-target");

    try {
      expect(await ws.join("users")).to.deep.equal({ ok: true });

      const updated = ws.next<any>("user:updated", u => u.id === target.id);

      expectStatus(
        await call(admin, "PATCH", `/api/v1/user/setPrivileges/${target.id}`, {
          roles: ["user"],
          permissions: ["profile:view"],
        }),
        200,
      );

      expect((await updated).id).to.equal(target.id);
    } finally {
      ws.close();
    }
  });

  it("отзыв права выводит сокет из комнаты: user:privileges-changed и room:revoked", async () => {
    const viewer = await signUp("ws-viewer");

    expectStatus(
      await call(admin, "PATCH", `/api/v1/user/setPrivileges/${viewer.id}`, {
        roles: ["user"],
        permissions: ["user:view"],
      }),
      200,
    );

    const refreshed = expectStatus(
      await call(null, "POST", "/api/v1/auth/refresh", {
        refreshToken: viewer.refresh,
      }),
      200,
    ).data;
    const socket = await connectSocket({
      ...viewer,
      access: (refreshed.tokens ?? refreshed).accessToken,
    });

    try {
      expect(await socket.join("users")).to.deep.equal({ ok: true });

      const changed = socket.next<any>("user:privileges-changed");
      const revoked = socket.next<any>("room:revoked");

      expectStatus(
        await call(admin, "PATCH", `/api/v1/user/setPrivileges/${viewer.id}`, {
          roles: ["user"],
          permissions: [],
        }),
        200,
      );

      expect((await changed).permissions).to.not.include("user:view");
      expect(await revoked).to.deep.equal({ type: "users", id: "all" });
    } finally {
      socket.close();
    }
  });
});

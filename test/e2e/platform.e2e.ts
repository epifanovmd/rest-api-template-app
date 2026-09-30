import { expect } from "chai";
import { generateKeyPairSync, sign } from "crypto";

import {
  Actor,
  call,
  eventually,
  expectStatus,
  fileForm,
  items,
  PNG_1PX,
  signIn,
  signInAdmin,
  signUp,
  uniqueEmail,
} from "./client";

const firstFile = (data: any) => (Array.isArray(data) ? data[0] : data);

describe("платформа", () => {
  let admin: Actor;
  let alice: Actor;
  let bob: Actor;

  before(async () => {
    admin = await signInAdmin();
    alice = await signUp("p-alice", { firstName: "Alice" });
    bob = await signUp("p-bob", { firstName: "Bob" });
  });

  describe("файлы (S3)", () => {
    it("multipart: сигнатура проверяется, обработка в фоне, ссылка подписана", async () => {
      const upload = expectStatus(
        await call(alice, "POST", "/api/v1/file", fileForm()),
        201,
      );
      const file = firstFile(upload.data);

      expectStatus(
        await call(
          alice,
          "POST",
          "/api/v1/file",
          fileForm("evil.png", Buffer.from("MZ\x90\x00 exe")),
        ),
        415,
      );
      expectStatus(
        await call(
          alice,
          "POST",
          "/api/v1/file",
          fileForm("x.exe", Buffer.from("MZ"), "application/x-msdownload"),
        ),
        415,
      );

      const ready = await eventually(
        async () => {
          const res = await call(alice, "GET", `/api/v1/file/${file.id}`);

          return res.data?.status === "ready" ? res.data : undefined;
        },
        { what: "обработка файла" },
      );
      const content = await fetch(ready.url);

      expect(content.status, "подписанная ссылка отдаёт файл").to.equal(200);

      // Подпись: S3 — `X-Amz-Signature`, локальный драйвер — `sig`.
      const tampered = await fetch(
        ready.url.replace(/((?:X-Amz-)?Signature|sig)=[^&]+/, "$1=00"),
      );

      expect(tampered.status, "подделанная подпись").to.be.oneOf([400, 403]);
      expectStatus(await call(alice, "GET", "/api/v1/file?limit=5"), 200);
      expectStatus(await call(bob, "GET", `/api/v1/file/${file.id}`), 404);
      expectStatus(await call(bob, "DELETE", `/api/v1/file/${file.id}`), 404);
      expectStatus(await call(alice, "DELETE", `/api/v1/file/${file.id}`), 204);
      expectStatus(await call(alice, "GET", `/api/v1/file/${file.id}`), 404);
    });

    it("области прав: свои файлы, просмотр всех, удаление без права — 403", async () => {
      const upload = expectStatus(
        await call(alice, "POST", "/api/v1/file", fileForm()),
        201,
      );
      const file = firstFile(upload.data);
      const mine = expectStatus(
        await call(alice, "GET", "/api/v1/file?limit=100"),
        200,
      );

      expect(items(mine.data).map(f => f.id)).to.include(file.id);

      // Роль без прав: доступ к файлам — только выданными правами.
      const role = expectStatus(
        await call(admin, "POST", "/api/v1/roles", {
          name: `files-${Date.now()}`,
        }),
        201,
      );

      expect(role.data.permissions).to.deep.equal([]);

      const auditor = await signUp("p-auditor");
      const grant = async (permissions: string[]) => {
        expectStatus(
          await call(
            admin,
            "PATCH",
            `/api/v1/user/setPrivileges/${auditor.id}`,
            { roles: [role.data.name], permissions },
          ),
          200,
        );

        return signIn(auditor.email, auditor.password);
      };

      const none = await grant([]);

      expectStatus(await call(none, "GET", "/api/v1/file"), 403);
      expectStatus(await call(none, "GET", `/api/v1/file/${file.id}`), 403);

      const viewer = await grant(["file:view"]);
      const own = expectStatus(await call(viewer, "GET", "/api/v1/file"), 200);
      const all = expectStatus(
        await call(viewer, "GET", "/api/v1/file?mine=false&limit=100"),
        200,
      );

      expect(items(own.data).map(f => f.id)).to.not.include(file.id);
      expect(items(all.data).map(f => f.id)).to.include(file.id);
      expectStatus(await call(viewer, "GET", `/api/v1/file/${file.id}`), 200);
      expectStatus(
        await call(viewer, "DELETE", `/api/v1/file/${file.id}`),
        403,
      );

      const cleaner = await grant(["file:view", "file:delete"]);

      expectStatus(
        await call(cleaner, "DELETE", `/api/v1/file/${file.id}`),
        204,
      );
    });

    it("прямая загрузка: PUT по подписанной ссылке, complete, обработка", async () => {
      const created = expectStatus(
        await call(alice, "POST", "/api/v1/file/uploads", {
          name: "photo.png",
          size: PNG_1PX.length,
          contentType: "image/png",
        }),
        201,
      );
      const { fileId, uploadUrl, headers } = created.data;

      expectStatus(
        await call(alice, "POST", `/api/v1/file/uploads/${fileId}/complete`),
        [400, 409],
      );

      // Клиент отправляет ровно те заголовки, что выдал сервер: они подписаны.
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers,
        body: PNG_1PX,
      });

      expect(put.status, "PUT в хранилище").to.be.oneOf([200, 201, 204]);
      expectStatus(
        await call(alice, "POST", `/api/v1/file/uploads/${fileId}/complete`),
        200,
      );
      await eventually(
        async () => {
          const res = await call(alice, "GET", `/api/v1/file/${fileId}`);

          return res.data?.status === "ready";
        },
        { what: "обработка прямой загрузки" },
      );
    });
  });

  describe("задачи и внешние воркеры", () => {
    it("API-ключ: выдаётся один раз, отзыв; схема apiKey", async () => {
      expectStatus(
        await call(alice, "POST", "/api/v1/api-keys", {
          name: "x",
          scopes: ["worker:*"],
        }),
        403,
      );

      const created = expectStatus(
        await call(admin, "POST", "/api/v1/api-keys", {
          name: "echo-worker",
          scopes: ["worker:demo.echo"],
        }),
        201,
      );
      const key = created.data.key;

      expect(key).to.match(/^[\w-]{8}\.[\w-]+$/);

      const list = expectStatus(
        await call(admin, "GET", "/api/v1/api-keys"),
        200,
      );

      expect(JSON.stringify(list.data)).to.not.include(key.split(".")[1]);

      // Внешний воркер: claim → heartbeat → complete
      const job = expectStatus(
        await call(admin, "POST", "/api/v1/jobs/demo/echo", {
          text: "привет",
          withOutput: true,
        }),
        201,
      );
      const claimed = await eventually(
        async () => {
          const res = await call(
            key,
            "POST",
            "/api/v1/worker/jobs/claim",
            {
              queues: ["demo.echo"],
              max: 1,
              waitSeconds: 1,
              worker: { name: "e2e-echo:1", meta: { device: "cpu" } },
            },
            { scheme: "ApiKey" },
          );

          return items(res.data).length || res.data?.length
            ? (res.data.items ?? res.data)[0]
            : undefined;
        },
        { what: "claim задачи воркером" },
      );

      expect(claimed.jobId).to.equal(job.data.jobId);

      // Статус воркеров: echo-воркер на связи по своей очереди.
      const status = expectStatus(
        await call(alice, "GET", "/api/v1/worker/status"),
        200,
      );
      const echo = status.data.find((q: any) => q.queue === "demo.echo");

      expect(echo.online).to.equal(true);
      expect(echo.workers.map((w: any) => w.name)).to.include("e2e-echo:1");
      expect(claimed.data.text).to.equal("привет");
      expect(claimed.outputs.echo, "подписанная ссылка для результата").to.be.a(
        "string",
      );

      const beat = expectStatus(
        await call(
          key,
          "POST",
          `/api/v1/worker/jobs/${claimed.jobId}/heartbeat`,
          { progress: 0.5, text: "половина", log: ["работаю"] },
          { scheme: "ApiKey" },
        ),
        200,
      );

      expect(beat.data.cancel).to.equal(false);

      const running = expectStatus(
        await call(admin, "GET", `/api/v1/jobs/${claimed.jobId}`),
        200,
      );

      expect(running.data.progress).to.equal(0.5);

      const out = await fetch(claimed.outputs.echo, {
        method: "PUT",
        headers: {
          "content-type": claimed.outputContentTypes?.echo ?? "text/plain",
        },
        body: "привет",
      });

      expect(out.status).to.be.oneOf([200, 201, 204]);
      expectStatus(
        await call(
          key,
          "POST",
          `/api/v1/worker/jobs/${claimed.jobId}/complete`,
          { result: { echo: "привет" } },
          { scheme: "ApiKey" },
        ),
        204,
      );

      const done = await eventually(
        async () => {
          const res = await call(admin, "GET", `/api/v1/jobs/${claimed.jobId}`);

          return res.data?.status === "completed" ? res.data : undefined;
        },
        { what: "завершение задачи" },
      );

      expect(done.result.echo).to.equal("привет");
      expectStatus(await call(admin, "GET", "/api/v1/jobs?limit=5"), 200);

      // Ошибка без повтора → failed
      const failing = expectStatus(
        await call(admin, "POST", "/api/v1/jobs/demo/echo", { text: "fail" }),
        201,
      );
      const second = await eventually(
        async () => {
          const res = await call(
            key,
            "POST",
            "/api/v1/worker/jobs/claim",
            { queues: ["demo.echo"], max: 1, waitSeconds: 1 },
            { scheme: "ApiKey" },
          );

          return (res.data?.items ?? res.data ?? [])[0];
        },
        { what: "claim второй задачи" },
      );

      expect(second.jobId).to.equal(failing.data.jobId);
      expectStatus(
        await call(
          key,
          "POST",
          `/api/v1/worker/jobs/${second.jobId}/fail`,
          { code: "BAD_INPUT", message: "не могу", retryable: false },
          { scheme: "ApiKey" },
        ),
        204,
      );
      await eventually(
        async () => {
          const res = await call(admin, "GET", `/api/v1/jobs/${second.jobId}`);

          return res.data?.status === "failed";
        },
        { what: "провал задачи" },
      );

      // Отмена ждущей задачи и чужой ключ
      const cancelled = expectStatus(
        await call(admin, "POST", "/api/v1/jobs/demo/echo", { text: "cancel" }),
        201,
      );

      expectStatus(
        await call(
          admin,
          "POST",
          `/api/v1/jobs/${cancelled.data.jobId}/cancel`,
        ),
        204,
      );
      expectStatus(
        await call(bob, "GET", `/api/v1/jobs/${cancelled.data.jobId}`),
        [403, 404],
      );
      expectStatus(
        await call(
          key,
          "POST",
          "/api/v1/worker/jobs/claim",
          { queues: ["file.process"], max: 1 },
          { scheme: "ApiKey" },
        ),
        400,
        "JOB_NOT_EXTERNAL",
      );

      expectStatus(
        await call(
          admin,
          "POST",
          `/api/v1/api-keys/${created.data.apiKey.id}/revoke`,
        ),
        204,
      );
      expectStatus(
        await call(
          key,
          "POST",
          "/api/v1/worker/jobs/claim",
          { queues: ["demo.echo"] },
          { scheme: "ApiKey" },
        ),
        401,
      );
    });
  });

  describe("биометрия, passkeys", () => {
    it("биометрия: вход по подписи, nonce одноразовый", async () => {
      const { publicKey, privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
      });
      const spki = publicKey
        .export({ type: "spki", format: "der" })
        .toString("base64");
      const signNonce = (nonce: string) =>
        sign("sha256", Buffer.from(nonce), privateKey).toString("base64");

      expectStatus(
        await call(bob, "POST", "/api/v1/biometric/register", {
          deviceId: "iphone-15",
          deviceName: "iPhone Bob",
          publicKey: spki,
        }),
        200,
      );
      expectStatus(
        await call(bob, "POST", "/api/v1/biometric/register", {
          deviceId: "",
          deviceName: "x".repeat(200),
          publicKey: "",
        }),
        400,
      );
      expectStatus(await call(bob, "GET", "/api/v1/biometric/devices"), 200);

      const nonce = (
        await call(null, "POST", "/api/v1/biometric/generate-nonce", {
          userId: bob.id,
          deviceId: "iphone-15",
        })
      ).data.nonce;

      expectStatus(
        await call(null, "POST", "/api/v1/biometric/verify-signature", {
          userId: bob.id,
          deviceId: "iphone-15",
          nonce,
          signature: "AAAA",
        }),
        401,
      );

      const fresh = (
        await call(null, "POST", "/api/v1/biometric/generate-nonce", {
          userId: bob.id,
          deviceId: "iphone-15",
        })
      ).data.nonce;
      const login = expectStatus(
        await call(null, "POST", "/api/v1/biometric/verify-signature", {
          userId: bob.id,
          deviceId: "iphone-15",
          nonce: fresh,
          signature: signNonce(fresh),
        }),
        200,
      );

      expect((login.data.tokens ?? login.data).accessToken).to.be.a("string");
      expectStatus(
        await call(null, "POST", "/api/v1/biometric/verify-signature", {
          userId: bob.id,
          deviceId: "iphone-15",
          nonce: fresh,
          signature: signNonce(fresh),
        }),
        401,
      );
      expectStatus(
        await call(bob, "DELETE", "/api/v1/biometric/iphone-15"),
        204,
      );
    });

    it("passkeys: опции, поддельные ответы отклоняются, аккаунт не раскрывается", async () => {
      expectStatus(
        await call(
          alice,
          "POST",
          "/api/v1/passkeys/generate-registration-options",
        ),
        200,
      );
      expectStatus(
        await call(alice, "POST", "/api/v1/passkeys/verify-registration", {
          data: {
            id: "x",
            rawId: "x",
            type: "public-key",
            response: { clientDataJSON: "e30", attestationObject: "AA" },
            clientExtensionResults: {},
          },
        }),
        400,
      );
      expectStatus(await call(alice, "GET", "/api/v1/passkeys"), 200);

      const known = expectStatus(
        await call(
          null,
          "POST",
          "/api/v1/passkeys/generate-authentication-options",
          {
            login: alice.email,
          },
        ),
        200,
      );
      const unknown = expectStatus(
        await call(
          null,
          "POST",
          "/api/v1/passkeys/generate-authentication-options",
          {
            login: uniqueEmail("ghost"),
          },
        ),
        200,
      );

      expect(known.data.allowCredentials).to.have.length(1);
      expect(unknown.data.allowCredentials).to.have.length(1);
      expectStatus(
        await call(null, "POST", "/api/v1/passkeys/verify-authentication", {
          data: {
            id: "x",
            rawId: "x",
            type: "public-key",
            response: {
              clientDataJSON: "e30",
              authenticatorData: "AA",
              signature: "AA",
            },
            clientExtensionResults: {},
          },
        }),
        401,
      );
      expectStatus(
        await call(
          alice,
          "DELETE",
          "/api/v1/passkeys/00000000-0000-4000-8000-000000000000",
        ),
        404,
      );
    });
  });
});

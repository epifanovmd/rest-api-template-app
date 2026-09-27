import { expect } from "chai";
import sinon from "sinon";

import { createFfmpeg } from "./ffmpeg";

describe("ffmpeg", () => {
  it("probe вызывает ffprobe с JSON-выводом и разбирает ответ", async () => {
    const exec = sinon.stub().resolves({
      stdout: JSON.stringify({
        streams: [{ codec_type: "video", width: 640, height: 360 }],
        format: { duration: "12.5" },
      }),
    });
    const probe = await createFfmpeg(exec).probe("/tmp/in.mp4");

    expect(exec.firstCall.args[0]).to.equal("ffprobe");
    expect(exec.firstCall.args[1]).to.include.members([
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      "/tmp/in.mp4",
    ]);
    expect(probe.streams?.[0]).to.deep.include({ width: 640, height: 360 });
    expect(probe.format?.duration).to.equal("12.5");
  });

  it("run перезаписывает выход и не шумит в лог", async () => {
    const exec = sinon.stub().resolves({ stdout: "" });

    await createFfmpeg(exec).run(["-i", "in.wav", "out.m4a"]);

    expect(exec.firstCall.args[0]).to.equal("ffmpeg");
    expect(exec.firstCall.args[1]).to.deep.equal([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "in.wav",
      "out.m4a",
    ]);
  });

  it("decode отдаёт stdout буфером с лимитом размера", async () => {
    const pcm = Buffer.from([1, 2, 3, 4]);
    const exec = sinon.stub().resolves({ stdout: pcm });

    const result = await createFfmpeg(exec).decode(
      ["-i", "a.ogg", "pipe:1"],
      1024,
    );

    expect(result).to.equal(pcm);
    expect(exec.firstCall.args[2]).to.deep.include({
      encoding: "buffer",
      maxBuffer: 1024,
    });
  });

  it("ошибка процесса пробрасывается", async () => {
    const exec = sinon.stub().rejects(new Error("spawn ffprobe ENOENT"));

    try {
      await createFfmpeg(exec).probe("x");
      expect.fail("should throw");
    } catch (err) {
      expect((err as Error).message).to.include("ENOENT");
    }
  });
});

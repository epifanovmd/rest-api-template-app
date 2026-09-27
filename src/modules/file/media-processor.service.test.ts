import { expect } from "chai";

import { computeWaveform, isProcessableMedia } from "./media-processor.service";

describe("media-processor", () => {
  it("isProcessableMedia: изображения, видео, аудио", () => {
    expect(isProcessableMedia("image/png")).to.equal(true);
    expect(isProcessableMedia("video/mp4")).to.equal(true);
    expect(isProcessableMedia("audio/mpeg")).to.equal(true);
    expect(isProcessableMedia("application/pdf")).to.equal(false);
  });

  it("computeWaveform: пики по сегментам 0..1", () => {
    const pcm = Buffer.alloc(8);

    pcm.writeInt16LE(32767, 0);
    pcm.writeInt16LE(-16384, 4);

    expect(computeWaveform(pcm, 2)).to.deep.equal([1, 0.5]);
    expect(computeWaveform(Buffer.alloc(0))).to.equal(null);
  });
});

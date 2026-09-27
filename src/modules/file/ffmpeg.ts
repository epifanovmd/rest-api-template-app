import { execFile } from "child_process";
import { promisify } from "util";

/** Метаданные ffprobe — только используемые поля. */
export interface IProbeData {
  streams?: { codec_type?: string; width?: number; height?: number }[];
  format?: { duration?: string };
}

type ExecFile = (
  file: string,
  args: string[],
  options?: { encoding?: "buffer" | "utf8"; maxBuffer?: number },
) => Promise<{ stdout: string | Buffer }>;

const execFileAsync = promisify(execFile) as unknown as ExecFile;

const QUIET = ["-hide_banner", "-loglevel", "error"];

/**
 * Тонкая обёртка над бинарниками ffmpeg/ffprobe из PATH. Асинхронная: долгое
 * декодирование не блокирует event loop. `exec` подменяется в тестах.
 */
export const createFfmpeg = (exec: ExecFile = execFileAsync) => ({
  /** Метаданные файла: потоки и длительность. */
  probe: async (filePath: string): Promise<IProbeData> => {
    const { stdout } = await exec("ffprobe", [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ]);

    return JSON.parse(String(stdout)) as IProbeData;
  },

  /** Запуск ffmpeg с перезаписью выходного файла. */
  run: async (args: string[]): Promise<void> => {
    await exec("ffmpeg", ["-y", ...QUIET, ...args]);
  },

  /** Декодирование в stdout (например, raw PCM) с лимитом размера. */
  decode: async (args: string[], maxBuffer: number): Promise<Buffer> => {
    const { stdout } = await exec("ffmpeg", [...QUIET, ...args], {
      encoding: "buffer",
      maxBuffer,
    });

    return stdout as Buffer;
  },
});

export const ffmpeg = createFfmpeg();

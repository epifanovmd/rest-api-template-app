import { multiInject, optional } from "inversify";

import { Injectable } from "../../core";
import { FILE_USAGE_PROBE, IFileUsageProbe } from "./file-usage.probe";

/** Сводит пробы всех модулей: какие из файлов где-то используются. */
@Injectable()
export class FileUsageChecker {
  constructor(
    @multiInject(FILE_USAGE_PROBE)
    @optional()
    private readonly _probes: IFileUsageProbe[] = [],
  ) {}

  async inUse(fileIds: string[]): Promise<Set<string>> {
    if (!fileIds.length) return new Set();

    const lists = await Promise.all(
      this._probes.map(probe => probe.filesInUse(fileIds)),
    );

    return new Set(lists.flat());
  }
}

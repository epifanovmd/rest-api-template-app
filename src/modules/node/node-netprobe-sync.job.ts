import { inject } from "inversify";

import { IJobHandler, Injectable, JobDefinition, logger } from "../../core";
import { NODE_NETPROBE_SYNC_QUEUE } from "./node.types";
import { NodeMeshService } from "./node-mesh.service";

/**
 * Сверка целей проверки сети (настройка `targets` воркера `netprobe`) у агентов
 * узлов: после изменений узлов и появления агента с воркером (постановка со
 * `singletonKey`) и по расписанию — страховка от пропуска.
 */
@Injectable()
export class NodeNetprobeSyncJob implements IJobHandler {
  readonly definition: JobDefinition = {
    queue: NODE_NETPROBE_SYNC_QUEUE,
    cron: "*/10 * * * *",
    // По одной: две сверки сразу задали бы ту же настройку двумя версиями.
    concurrency: 1,
    retryLimit: 2,
    retryDelaySeconds: 5,
  };

  constructor(
    @inject(NodeMeshService) private readonly _mesh: NodeMeshService,
  ) {}

  async handle(): Promise<void> {
    const changed = await this._mesh.syncTargets();

    if (changed > 0) {
      logger.info({ changed }, "[Node] Цели проверки сети обновлены");
    }
  }
}

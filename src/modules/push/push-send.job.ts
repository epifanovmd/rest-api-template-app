import { inject } from "inversify";

import { IJobHandler, Injectable, JobContext, JobDefinition } from "../../core";
import { PushService } from "./push.service";
import { PUSH_SEND_QUEUE, TPushSendJobData } from "./push.types";

/**
 * Обработчик `push.send`. Повторы очереди — на сбой до отправки (чтение
 * токенов); частичный сбой FCM повторяется отдельной задачей в `deliver`.
 */
@Injectable()
export class PushSendJob implements IJobHandler<TPushSendJobData> {
  readonly definition: JobDefinition = {
    queue: PUSH_SEND_QUEUE,
    retryLimit: 3,
    retryDelaySeconds: 10,
    retryBackoff: true,
    expireInSeconds: 120,
  };

  constructor(@inject(PushService) private readonly _push: PushService) {}

  handle(ctx: JobContext<TPushSendJobData>): Promise<void> {
    return this._push.deliver(ctx.data);
  }
}

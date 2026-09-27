import { inject } from "inversify";

import {
  IJobHandler,
  Injectable,
  JobContext,
  JobDefinition,
  logger,
} from "../../core";
import { CALL_RINGING_TIMEOUT_QUEUE, CallService } from "./call.service";

/** Страховочный проход раз в минуту: звонки, чья задача потерялась. */
export const CALL_RINGING_SWEEP_QUEUE = "call.ringing-sweep";

export interface ICallRingingTimeoutJob {
  callId: string;
}

/**
 * RINGING → MISSED точно в срок звонка. Ставится в транзакции создания
 * звонка; если звонок уже отвечен/отклонён — ничего не делает.
 */
@Injectable()
export class CallRingingTimeoutJobHandler implements IJobHandler<
  ICallRingingTimeoutJob,
  boolean
> {
  readonly definition: JobDefinition = {
    queue: CALL_RINGING_TIMEOUT_QUEUE,
    retryLimit: 3,
    retryDelaySeconds: 5,
    expireInSeconds: 60,
  };

  constructor(
    @inject(CallService) private readonly _callService: CallService,
  ) {}

  handle({ data }: JobContext<ICallRingingTimeoutJob>): Promise<boolean> {
    return this._callService.expireRingingCall(data.callId);
  }
}

/** Раз в минуту переводит в MISSED все просроченные RINGING-звонки. */
@Injectable()
export class CallRingingSweepJobHandler implements IJobHandler<object, number> {
  readonly definition: JobDefinition = {
    queue: CALL_RINGING_SWEEP_QUEUE,
    cron: "* * * * *",
    retryLimit: 0,
    expireInSeconds: 60,
  };

  constructor(
    @inject(CallService) private readonly _callService: CallService,
  ) {}

  async handle(): Promise<number> {
    const expired = await this._callService.expireRingingCalls();

    if (expired > 0) {
      logger.info(
        { expired },
        "[Call] Просроченные звонки переведены в MISSED",
      );
    }

    return expired;
  }
}

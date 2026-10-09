import {
  Injectable,
  IWorkerRequestHandler,
  WorkerRequestError,
  WorkerRequestInfo,
} from "../../core";

/** Запрос воркера `echo` к серверу: префикс для текста задачи `echo.quick`. */
export const DEMO_ECHO_LOOKUP = "echo.lookup";

/** Метка узла с префиксом для `echo.lookup`; без неё — имя агента. */
export const DEMO_ECHO_PREFIX_LABEL = "echoPrefix";

/** Самый длинный текст, на который сервер отвечает префиксом. */
export const DEMO_ECHO_LOOKUP_MAX_TEXT = 200;

export interface IDemoEchoLookupData {
  text: string;
}

export interface IDemoEchoLookupResult {
  prefix: string;
}

/**
 * Эталон обработчика запроса воркера: воркер `echo` во время задачи
 * `echo.quick` с `lookup: true` спрашивает у сервера префикс. Только от
 * воркера `echo` (`workers`); `data` уже проверено по схеме из манифеста.
 * Префикс — метка узла `echoPrefix` или имя агента; слишком длинный текст —
 * отказ с кодом (воркер получит 422 и завершит задачу ошибкой).
 */
@Injectable()
export class DemoEchoLookupHandler implements IWorkerRequestHandler<
  IDemoEchoLookupData,
  IDemoEchoLookupResult
> {
  readonly type = DEMO_ECHO_LOOKUP;
  readonly workers = ["echo"];

  async handle({
    agent,
    data,
  }: WorkerRequestInfo<IDemoEchoLookupData>): Promise<IDemoEchoLookupResult> {
    const text = data?.text ?? "";

    if (text.length > DEMO_ECHO_LOOKUP_MAX_TEXT) {
      throw new WorkerRequestError(
        "ECHO_TEXT_TOO_LONG",
        `Текст длиннее ${DEMO_ECHO_LOOKUP_MAX_TEXT} символов`,
      );
    }

    return {
      prefix: agent.labels[DEMO_ECHO_PREFIX_LABEL] ?? `[${agent.name}] `,
    };
  }
}

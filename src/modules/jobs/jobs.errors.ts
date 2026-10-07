import { defineErrors, HttpStatus } from "../../core";

export const JobsError = defineErrors("JOB", {
  NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: "Задача не найдена" },
  FORBIDDEN: {
    status: HttpStatus.FORBIDDEN,
    message: "Нет доступа к задаче",
  },
  NOT_CANCELLABLE: {
    status: HttpStatus.CONFLICT,
    message: "Задача уже завершена",
  },
  UNKNOWN_QUEUE: {
    status: HttpStatus.BAD_REQUEST,
    message: "Очередь не зарегистрирована",
  },
  NOT_EXTERNAL: {
    status: HttpStatus.BAD_REQUEST,
    message: "Очередь не выполняется агентами",
  },
  LEASE_LOST: {
    status: HttpStatus.CONFLICT,
    message: "Задача больше не за этим агентом: отменена или выдана заново",
  },
  REQUEST_TIMEOUT: {
    status: HttpStatus.GATEWAY_TIMEOUT,
    message: "Исполнитель задачи не ответил вовремя",
  },
  REQUEST_FAILED: {
    status: HttpStatus.BAD_GATEWAY,
    message: "Исполнитель не смог выполнить задачу",
  },
  STORAGE_UNAVAILABLE: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: "Хранилище файлов не подключено",
  },
});

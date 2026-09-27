import { defineErrors } from "../../core";

/**
 * Доменные ошибки звонков: коды `CALL_*`. Переход из неподходящего состояния
 * (не звонит, уже завершён) — 409: запрос корректен, конфликтует состояние.
 */
export const CallError = defineErrors("CALL", {
  NOT_FOUND: { status: 404, message: "Звонок не найден" },
  SELF_CALL: { status: 400, message: "Нельзя позвонить самому себе" },
  USER_NOT_FOUND: { status: 404, message: "Пользователь не найден" },
  USER_BLOCKED: {
    status: 403,
    message: "Звонок этому пользователю недоступен",
  },
  ALREADY_IN_CALL: {
    status: 409,
    message: "У вас уже есть активный звонок",
  },
  BUSY: { status: 409, message: "Пользователь уже в звонке" },
  NOT_CALLEE: {
    status: 403,
    message: "Вы не можете ответить на этот звонок",
  },
  NOT_PARTICIPANT: { status: 403, message: "Вы не участник этого звонка" },
  NOT_RINGING: { status: 409, message: "Звонок не в состоянии ожидания" },
  RINGING_EXPIRED: { status: 409, message: "Время ожидания ответа истекло" },
  ALREADY_ENDED: { status: 409, message: "Звонок уже завершён" },
  STATE_CHANGED: { status: 409, message: "Состояние звонка уже изменилось" },
  NOT_ACTIVE: {
    status: 403,
    message: "Вы не участник активного звонка",
  },
});

import { defineErrors, HttpStatus } from "../../core";

export const JobsError = defineErrors("JOB", {
  UNKNOWN_QUEUE: {
    status: HttpStatus.BAD_REQUEST,
    message: "Очередь не зарегистрирована",
  },
});

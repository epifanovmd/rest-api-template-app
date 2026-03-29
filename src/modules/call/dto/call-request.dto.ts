import { ECallType } from "../call.types";

export interface IInitiateCallBody {
  calleeId: string;
  chatId?: string;
  type?: ECallType;
}

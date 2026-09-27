import { ECallType } from "../call.types";

export interface IInitiateCallBody {
  calleeId: string;
  type?: ECallType;
}

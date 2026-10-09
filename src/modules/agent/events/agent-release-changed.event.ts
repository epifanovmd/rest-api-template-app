import type { IAgentReleaseChangeDto } from "../dto";

/** Вышла другая версия агента (или получена первая). */
export class AgentReleaseChangedEvent {
  constructor(public readonly release: IAgentReleaseChangeDto) {}
}

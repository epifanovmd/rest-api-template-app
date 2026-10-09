import type { IAgentReleaseChangeDto } from "../dto";

/** В источнике выпусков агента появилась другая версия (или получена первая). */
export class AgentReleaseChangedEvent {
  constructor(public readonly release: IAgentReleaseChangeDto) {}
}

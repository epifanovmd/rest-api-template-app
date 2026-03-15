import {
  WgOverviewStatsPayload,
  WgPeerStatsPayload,
  WgServerStatsPayload,
} from "../../socket/socket.types";

export class WgStatsUpdatedEvent {
  static readonly eventName = "wg.stats.updated" as const;

  constructor(
    public readonly overview: WgOverviewStatsPayload,
    public readonly servers: WgServerStatsPayload[],
    public readonly peers: WgPeerStatsPayload[],
  ) {}
}

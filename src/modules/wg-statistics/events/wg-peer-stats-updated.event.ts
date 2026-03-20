import { WgPeerStatsPayload } from "../../socket/socket.types";

export class WgPeerStatsUpdatedEvent {
  static readonly eventName = "wg.peer.stats.updated" as const;

  constructor(public readonly peer: WgPeerStatsPayload) {}
}

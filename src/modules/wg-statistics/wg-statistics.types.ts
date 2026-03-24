export interface AggregatedTrafficPoint {
  timestamp: Date;
  rxBytes: number;
  txBytes: number;
}

export interface AggregatedSpeedPoint {
  timestamp: Date;
  rxSpeedBps: number;
  txSpeedBps: number;
}

export interface AggregatedFilters {
  serverId?: string;
  peerId?: string;
  /** Filter by multiple server IDs (OR logic). Ignored if serverId is set. */
  serverIds?: string[];
  /** Filter by multiple peer IDs (OR logic). Ignored if peerId is set. */
  peerIds?: string[];
}

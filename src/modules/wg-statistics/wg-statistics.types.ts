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
  /** Фильтр по нескольким ID серверов (логика ИЛИ). Игнорируется, если задан serverId. */
  serverIds?: string[];
  /** Фильтр по нескольким ID пиров (логика ИЛИ). Игнорируется, если задан peerId. */
  peerIds?: string[];
}

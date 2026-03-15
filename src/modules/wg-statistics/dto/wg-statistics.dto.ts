import { WgSpeedSample } from "../wg-speed-sample.entity";
import { WgTrafficStat } from "../wg-traffic-stat.entity";

export class WgTrafficStatDto {
  id: string;
  peerId: string;
  serverId: string;
  rxBytes: number;
  txBytes: number;
  lastHandshake: Date | null;
  endpoint: string | null;
  timestamp: Date;

  static fromEntity(e: WgTrafficStat): WgTrafficStatDto {
    const dto = new WgTrafficStatDto();

    dto.id = e.id;
    dto.peerId = e.peerId;
    dto.serverId = e.serverId;
    dto.rxBytes = e.rxBytes;
    dto.txBytes = e.txBytes;
    dto.lastHandshake = e.lastHandshake;
    dto.endpoint = e.endpoint;
    dto.timestamp = e.timestamp;

    return dto;
  }
}

export class WgSpeedSampleDto {
  id: string;
  peerId: string;
  serverId: string;
  rxSpeedBps: number;
  txSpeedBps: number;
  isActive: boolean;
  timestamp: Date;

  static fromEntity(e: WgSpeedSample): WgSpeedSampleDto {
    const dto = new WgSpeedSampleDto();

    dto.id = e.id;
    dto.peerId = e.peerId;
    dto.serverId = e.serverId;
    dto.rxSpeedBps = e.rxSpeedBps;
    dto.txSpeedBps = e.txSpeedBps;
    dto.isActive = e.isActive;
    dto.timestamp = e.timestamp;

    return dto;
  }
}

export interface IWgStatsQueryParams {
  from?: string;
  to?: string;
  limit?: number;
}

export interface IWgPeerStatsResponse {
  peerId: string;
  traffic: WgTrafficStatDto[];
  speed: WgSpeedSampleDto[];
  latest: {
    rxBytes: number;
    txBytes: number;
    rxSpeedBps: number;
    txSpeedBps: number;
    isActive: boolean;
    lastHandshake: Date | null;
  } | null;
}

export interface IWgServerStatsResponse {
  serverId: string;
  traffic: WgTrafficStatDto[];
  speed: WgSpeedSampleDto[];
}

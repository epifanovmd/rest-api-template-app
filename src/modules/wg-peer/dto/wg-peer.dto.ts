import { IListResponseDto } from "../../../core/dto/ListResponse";
import { EWgServerStatus } from "../../wg-server/wg-server.types";
import { WG_PEER_ACTIVE_THRESHOLD_MS } from "../wg-peer.constants";
import { WgPeer } from "../wg-peer.entity";

export interface IWgPeerFilters {
  query?: string;
  enabled?: boolean;
  status?: EWgServerStatus;
  serverId?: string;
  userId?: string;
}

export interface IWgPeerOptionDto {
  id: string;
  name: string;
}

export interface IWgPeerOptionsDto {
  data: IWgPeerOptionDto[];
}

export interface IWgPeerCreateRequestDto {
  name: string;
  presharedKey?: boolean;
  persistentKeepalive?: number;
  dns?: string;
  mtu?: number;
  clientAllowedIPs?: string;
  description?: string;
  expiresAt?: string;
  enabled?: boolean;
}

export interface IWgPeerUpdateRequestDto {
  name?: string;
  allowedIPs?: string;
  userId?: string | null;
  /** true — сгенерировать новый, false/null — удалить существующий */
  presharedKey?: boolean | null;
  persistentKeepalive?: number | null;
  dns?: string | null;
  mtu?: number | null;
  clientAllowedIPs?: string;
  description?: string | null;
  expiresAt?: string | null;
  enabled?: boolean;
}

export class WgPeerDto {
  id: string;
  serverId: string;
  userId: string | null;
  name: string;
  publicKey: string;
  hasPresharedKey: boolean;
  allowedIPs: string;
  persistentKeepalive: number | null;
  dns: string | null;
  mtu: number | null;
  clientAllowedIPs: string;
  enabled: boolean;
  status: EWgServerStatus;
  expiresAt: Date | null;
  description: string | null;
  lastHandshake: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(e: WgPeer): WgPeerDto {
    const dto = new WgPeerDto();

    dto.id = e.id;
    dto.serverId = e.serverId;
    dto.userId = e.userId;
    dto.name = e.name;
    dto.publicKey = e.publicKey;
    dto.hasPresharedKey = e.presharedKey !== null;
    dto.allowedIPs = e.allowedIPs;
    dto.persistentKeepalive = e.persistentKeepalive;
    dto.dns = e.dns;
    dto.mtu = e.mtu;
    dto.clientAllowedIPs = e.clientAllowedIPs;
    dto.enabled = e.enabled;
    dto.status = e.status;
    dto.expiresAt = e.expiresAt;
    dto.description = e.description;
    dto.lastHandshake = e.lastHandshake ?? null;
    dto.isActive =
      e.lastHandshake !== null &&
      Date.now() - e.lastHandshake.getTime() < WG_PEER_ACTIVE_THRESHOLD_MS;
    dto.createdAt = e.createdAt;
    dto.updatedAt = e.updatedAt;

    return dto;
  }
}

export interface IWgPeerListDto extends IListResponseDto<WgPeerDto[]> {}

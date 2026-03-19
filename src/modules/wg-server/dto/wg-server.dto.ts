import { IListResponseDto } from "../../../core/dto/ListResponse";
import { WgServer } from "../wg-server.entity";
import { EWgServerStatus } from "../wg-server.types";

export interface IWgServerCreateRequestDto {
  userId?: string | null;
  name: string;
  interface: string;
  listenPort: number;
  address: string;
  dns?: string;
  endpoint?: string;
  mtu?: number;
  preUp?: string;
  preDown?: string;
  postUp?: string;
  postDown?: string;
  description?: string;
  enabled?: boolean;
}

export interface IWgServerUpdateRequestDto {
  name?: string;
  listenPort?: number;
  address?: string;
  dns?: string;
  endpoint?: string;
  mtu?: number;
  preUp?: string | null;
  preDown?: string | null;
  postUp?: string | null;
  postDown?: string | null;
  description?: string;
  enabled?: boolean;
}

export interface IWgServerStatusDto {
  serverId: string;
  interface: string;
  status: EWgServerStatus;
  listenPort: number;
  peerCount: number;
  activePeerCount: number;
  publicKey: string;
}

export class WgServerDto {
  id: string;
  userId: string | null;
  name: string;
  interface: string;
  listenPort: number;
  publicKey: string;
  address: string;
  dns: string | null;
  endpoint: string | null;
  mtu: number | null;
  preUp: string | null;
  preDown: string | null;
  postUp: string | null;
  postDown: string | null;
  status: EWgServerStatus;
  enabled: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(e: WgServer): WgServerDto {
    const dto = new WgServerDto();

    dto.id = e.id;
    dto.userId = e.userId;
    dto.name = e.name;
    dto.interface = e.interface;
    dto.listenPort = e.listenPort;
    dto.publicKey = e.publicKey;
    dto.address = e.address;
    dto.dns = e.dns;
    dto.endpoint = e.endpoint;
    dto.mtu = e.mtu;
    dto.preUp = e.preUp;
    dto.preDown = e.preDown;
    dto.postUp = e.postUp;
    dto.postDown = e.postDown;
    dto.status = e.status;
    dto.enabled = e.enabled;
    dto.description = e.description;
    dto.createdAt = e.createdAt;
    dto.updatedAt = e.updatedAt;

    return dto;
  }
}

export interface IWgServerListDto extends IListResponseDto<WgServerDto[]> {}

import * as QRCode from "qrcode";

import { Injectable } from "../../core";

export interface ServerConfigOptions {
  privateKey: string;
  address: string;
  listenPort: number;
  dns?: string;
  mtu?: number;
  preUp?: string;
  preDown?: string;
  postUp?: string;
  postDown?: string;
  peers: PeerConfigSection[];
}

export interface PeerConfigSection {
  publicKey: string;
  presharedKey?: string;
  allowedIPs: string;
  persistentKeepalive?: number;
  endpoint?: string;
  /** Мета-информация, записываемая как комментарии перед блоком [Peer] */
  meta?: {
    id: string;
    name: string;
    userId?: string | null;
  };
}

export interface ClientConfigOptions {
  /** Приватный ключ пира */
  privateKey: string;
  /** VPN-адрес пира (например, 10.0.0.2/32) */
  address: string;
  dns?: string;
  mtu?: number;
  /** Публичный ключ сервера */
  serverPublicKey: string;
  presharedKey?: string;
  /** Эндпоинт сервера (host:port) */
  serverEndpoint: string;
  /** Трафик, маршрутизируемый через VPN (по умолчанию 0.0.0.0/0) */
  allowedIPs?: string;
  persistentKeepalive?: number;
}

/** Сервис для генерации конфигурационных файлов WireGuard и QR-кодов к ним. */
@Injectable()
export class WgConfigService {
  /**
   * Сгенерировать конфигурацию [Interface] + [Peer] для WireGuard-сервера
   */
  buildServerConfig(opts: ServerConfigOptions): string {
    const lines: string[] = [
      "[Interface]",
      `PrivateKey = ${opts.privateKey}`,
      `Address = ${opts.address}`,
      `ListenPort = ${opts.listenPort}`,
    ];

    if (opts.dns) lines.push(`DNS = ${opts.dns}`);
    if (opts.mtu) lines.push(`MTU = ${opts.mtu}`);
    if (opts.preUp) lines.push(`PreUp = ${opts.preUp}`);
    if (opts.preDown) lines.push(`PreDown = ${opts.preDown}`);
    if (opts.postUp) lines.push(`PostUp = ${opts.postUp}`);
    if (opts.postDown) lines.push(`PostDown = ${opts.postDown}`);

    for (const peer of opts.peers) {
      lines.push("");
      if (peer.meta) {
        lines.push(`# Name: ${peer.meta.name}`);
        lines.push(`# ID: ${peer.meta.id}`);
        if (peer.meta.userId) lines.push(`# UserID: ${peer.meta.userId}`);
      }
      lines.push("[Peer]", `PublicKey = ${peer.publicKey}`);
      if (peer.presharedKey) lines.push(`PresharedKey = ${peer.presharedKey}`);
      lines.push(`AllowedIPs = ${peer.allowedIPs}`);
      if (peer.endpoint) lines.push(`Endpoint = ${peer.endpoint}`);
      if (peer.persistentKeepalive != null) {
        lines.push(`PersistentKeepalive = ${peer.persistentKeepalive}`);
      }
    }

    return lines.join("\n") + "\n";
  }

  /**
   * Сгенерировать содержимое клиентского .conf файла
   */
  buildClientConfig(opts: ClientConfigOptions): string {
    const allowedIPs = opts.allowedIPs ?? "0.0.0.0/0, ::/0";
    const lines: string[] = [
      "[Interface]",
      `PrivateKey = ${opts.privateKey}`,
      `Address = ${opts.address}`,
    ];

    if (opts.dns) lines.push(`DNS = ${opts.dns}`);
    if (opts.mtu) lines.push(`MTU = ${opts.mtu}`);

    lines.push("", "[Peer]", `PublicKey = ${opts.serverPublicKey}`);
    if (opts.presharedKey) lines.push(`PresharedKey = ${opts.presharedKey}`);
    lines.push(
      `Endpoint = ${opts.serverEndpoint}`,
      `AllowedIPs = ${allowedIPs}`,
    );
    if (opts.persistentKeepalive != null) {
      lines.push(`PersistentKeepalive = ${opts.persistentKeepalive}`);
    }

    return lines.join("\n") + "\n";
  }

  /**
   * Сгенерировать QR-код как PNG Buffer из текста конфигурации
   */
  async buildQrCode(configText: string): Promise<Buffer> {
    return QRCode.toBuffer(configText, {
      type: "png",
      errorCorrectionLevel: "M",
      width: 400,
      margin: 2,
    });
  }

  /**
   * Сгенерировать QR-код как base64 data URL
   */
  async buildQrCodeDataUrl(configText: string): Promise<string> {
    return QRCode.toDataURL(configText, {
      errorCorrectionLevel: "M",
      width: 400,
      margin: 2,
    });
  }
}

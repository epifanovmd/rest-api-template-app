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
  /** Meta info written as comments above the [Peer] block */
  meta?: {
    id: string;
    name: string;
    userId?: string | null;
  };
}

export interface ClientConfigOptions {
  /** Peer private key */
  privateKey: string;
  /** Peer VPN address (e.g. 10.0.0.2/32) */
  address: string;
  dns?: string;
  mtu?: number;
  /** Server public key */
  serverPublicKey: string;
  presharedKey?: string;
  /** Server endpoint (host:port) */
  serverEndpoint: string;
  /** Traffic routed through VPN (default 0.0.0.0/0) */
  allowedIPs?: string;
  persistentKeepalive?: number;
}

@Injectable()
export class WgConfigService {
  /**
   * Generate the [Interface] + [Peer] config for the WireGuard server
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
   * Generate the client .conf file content
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
   * Generate QR code as PNG Buffer from config text
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
   * Generate QR code as base64 data URL
   */
  async buildQrCodeDataUrl(configText: string): Promise<string> {
    return QRCode.toDataURL(configText, {
      errorCorrectionLevel: "M",
      width: 400,
      margin: 2,
    });
  }
}

import { exec } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { promisify } from "util";

import { config } from "../../config";
import { Injectable, logger } from "../../core";

const execAsync = promisify(exec);

export interface WgPeerStats {
  publicKey: string;
  endpoint: string | null;
  allowedIPs: string[];
  lastHandshake: Date | null;
  rxBytes: number;
  txBytes: number;
  persistentKeepalive: number | null;
}

export interface WgShowOutput {
  interface: string;
  publicKey: string;
  listenPort: number;
  peers: WgPeerStats[];
}

@Injectable()
export class WgCliService {
  private readonly wg = config.wireguard.binaryPath;
  private readonly wgQuick = config.wireguard.quickBinaryPath;
  private readonly configDir = config.wireguard.configDir;

  /**
   * Start a WireGuard interface
   */
  async up(interfaceName: string): Promise<void> {
    const confPath = path.join(this.configDir, `${interfaceName}.conf`);

    await execAsync(`${this.wgQuick} up ${confPath}`);
    logger.info({ interfaceName }, "[WgCli] Interface started");
  }

  /**
   * Stop a WireGuard interface
   */
  async down(interfaceName: string): Promise<void> {
    const confPath = path.join(this.configDir, `${interfaceName}.conf`);

    await execAsync(`${this.wgQuick} down ${confPath}`);
    logger.info({ interfaceName }, "[WgCli] Interface stopped");
  }

  /**
   * Get status of all or a specific interface
   */
  async show(interfaceName?: string): Promise<WgShowOutput[]> {
    const { stdout } = await execAsync(`${this.wg} show all dump`);
    const all = this.parseDump(stdout);

    if (interfaceName) {
      return all.filter(i => i.interface === interfaceName);
    }

    return all;
  }

  /**
   * Add a peer to a running interface
   */
  async addPeer(
    interfaceName: string,
    publicKey: string,
    allowedIPs: string,
    presharedKey?: string,
    persistentKeepalive?: number,
  ): Promise<void> {
    let cmd = `${this.wg} set ${interfaceName} peer ${publicKey} allowed-ips ${allowedIPs}`;

    if (presharedKey) {
      cmd += ` preshared-key <(echo '${presharedKey}')`;
    }
    if (persistentKeepalive) {
      cmd += ` persistent-keepalive ${persistentKeepalive}`;
    }

    await execAsync(`bash -c "${cmd}"`);
    logger.info({ interfaceName, publicKey }, "[WgCli] Peer added to interface");
  }

  /**
   * Remove a peer from a running interface
   */
  async removePeer(interfaceName: string, publicKey: string): Promise<void> {
    await execAsync(
      `${this.wg} set ${interfaceName} peer ${publicKey} remove`,
    );
    logger.info({ interfaceName, publicKey }, "[WgCli] Peer removed from interface");
  }

  /**
   * Write the WireGuard config file for a server
   */
  async writeServerConfig(
    interfaceName: string,
    configContent: string,
  ): Promise<void> {
    const confPath = path.join(this.configDir, `${interfaceName}.conf`);

    await fs.mkdir(this.configDir, { recursive: true });
    await fs.writeFile(confPath, configContent, { mode: 0o600 });
    logger.info({ confPath }, "[WgCli] Config file written");
  }

  /**
   * Delete the WireGuard config file
   */
  async deleteServerConfig(interfaceName: string): Promise<void> {
    const confPath = path.join(this.configDir, `${interfaceName}.conf`);

    try {
      await fs.unlink(confPath);
      logger.info({ confPath }, "[WgCli] Config file deleted");
    } catch {
      // ignore if file doesn't exist
    }
  }

  /**
   * Check if an interface is currently up
   */
  async isInterfaceUp(interfaceName: string): Promise<boolean> {
    try {
      await execAsync(`${this.wg} show ${interfaceName}`);

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse `wg show all dump` output
   * Format per line:
   *   interface: <name> <pubkey> <privkey> <listen_port> <fwmark>
   *   peer:      <iface> <pubkey> <preshared> <endpoint> <allowed_ips> <last_handshake> <rx> <tx> <keepalive>
   */
  private parseDump(raw: string): WgShowOutput[] {
    const lines = raw.trim().split("\n");
    const interfaces: Map<string, WgShowOutput> = new Map();
    let currentIface: string | null = null;

    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split("\t");

      if (parts.length === 5) {
        // Interface line: name pubkey privkey listenPort fwmark
        const [name, pubkey, , listenPortStr] = parts;
        const listenPort = parseInt(listenPortStr, 10);

        interfaces.set(name, {
          interface: name,
          publicKey: pubkey,
          listenPort,
          peers: [],
        });
        currentIface = name;
      } else if (parts.length === 9 && currentIface) {
        // Peer line: iface pubkey preshared endpoint allowedIPs lastHandshake rx tx keepalive
        const [
          ,
          pubkey,
          ,
          endpoint,
          allowedIPsRaw,
          lastHandshakeStr,
          rxStr,
          txStr,
          keepaliveStr,
        ] = parts;

        const lastHandshakeTs = parseInt(lastHandshakeStr, 10);
        const lastHandshake =
          lastHandshakeTs > 0 ? new Date(lastHandshakeTs * 1000) : null;

        const iface = interfaces.get(currentIface);

        if (iface) {
          iface.peers.push({
            publicKey: pubkey,
            endpoint: endpoint === "(none)" ? null : endpoint,
            allowedIPs: allowedIPsRaw.split(",").map(s => s.trim()),
            lastHandshake,
            rxBytes: parseInt(rxStr, 10) || 0,
            txBytes: parseInt(txStr, 10) || 0,
            persistentKeepalive:
              keepaliveStr === "off" ? null : parseInt(keepaliveStr, 10),
          });
        }
      }
    }

    return Array.from(interfaces.values());
  }
}

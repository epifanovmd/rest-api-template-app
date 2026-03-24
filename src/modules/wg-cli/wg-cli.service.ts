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

/** Сервис-обёртка над CLI-инструментами wg и wg-quick для управления WireGuard-интерфейсами. */
@Injectable()
export class WgCliService {
  private readonly wg = config.wireguard.binaryPath;
  private readonly wgQuick = config.wireguard.quickBinaryPath;
  private readonly configDir = config.wireguard.configDir;

  /**
   * Запустить WireGuard-интерфейс
   */
  async up(interfaceName: string): Promise<void> {
    const confPath = path.join(this.configDir, `${interfaceName}.conf`);

    await execAsync(`${this.wgQuick} up ${confPath}`);
    logger.info({ interfaceName }, "[WgCli] Interface started");
  }

  /**
   * Остановить WireGuard-интерфейс
   */
  async down(interfaceName: string): Promise<void> {
    const confPath = path.join(this.configDir, `${interfaceName}.conf`);

    await execAsync(`${this.wgQuick} down ${confPath}`);
    logger.info({ interfaceName }, "[WgCli] Interface stopped");
  }

  /**
   * Получить статус всех или конкретного интерфейса
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
   * Добавить пира к работающему интерфейсу
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
   * Удалить пира из работающего интерфейса
   */
  async removePeer(interfaceName: string, publicKey: string): Promise<void> {
    await execAsync(
      `${this.wg} set ${interfaceName} peer ${publicKey} remove`,
    );
    logger.info({ interfaceName, publicKey }, "[WgCli] Peer removed from interface");
  }

  /**
   * Записать конфигурационный файл WireGuard для сервера
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
   * Удалить конфигурационный файл WireGuard
   */
  async deleteServerConfig(interfaceName: string): Promise<void> {
    const confPath = path.join(this.configDir, `${interfaceName}.conf`);

    try {
      await fs.unlink(confPath);
      logger.info({ confPath }, "[WgCli] Config file deleted");
    } catch {
      // игнорируем, если файл не существует
    }
  }

  /**
   * Проверить, активен ли интерфейс в данный момент
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
   * Разобрать вывод `wg show all dump`
   * Формат строки:
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
        // Строка интерфейса: name pubkey privkey listenPort fwmark
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
        // Строка пира: iface pubkey preshared endpoint allowedIPs lastHandshake rx tx keepalive
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

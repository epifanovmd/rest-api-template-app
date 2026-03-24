/* eslint-disable no-bitwise */
import { inject } from "inversify";

import { Injectable } from "../../core";
import { WgPeerRepository } from "./wg-peer.repository";

/** Сервис для автоматического выделения IP-адресов WireGuard-пирам в пределах подсети сервера. */
@Injectable()
export class WgIpAllocatorService {
  constructor(
    @inject(WgPeerRepository) private readonly peerRepo: WgPeerRepository,
  ) {}

  /**
   * Выделяет следующий свободный /32 хост-адрес в подсети сервера.
   *
   * Сам сервер занимает первый хост (например 10.0.0.1/24 → .1 занят).
   * Сканируем существующие пиры сервера и возвращаем наименьший незанятый хост.
   *
   * @param serverAddress  VPN-адрес сервера с маской, например "10.0.0.1/24"
   * @param serverId       Используется для получения существующих выделений пиров
   * @returns              например "10.0.0.2/32"
   * @throws               Если подсеть исчерпана
   */
  async allocate(serverAddress: string, serverId: string): Promise<string> {
    const { networkBase, prefix } = this.parseAddress(serverAddress);

    const totalHosts = (1 << (32 - prefix)) - 2; // вычитаем адрес сети + broadcast
    const baseInt = this.ipToInt(networkBase);

    // Собираем уже занятые хост-целые числа (сервер + пиры)
    const serverHostInt = this.ipToInt(serverAddress.split("/")[0]);
    const usedInts = new Set<number>([serverHostInt]);

    const [peers] = await this.peerRepo.findByServer(serverId);

    for (const peer of peers) {
      const ip = peer.allowedIPs.split("/")[0];

      usedInts.add(this.ipToInt(ip));
    }

    // Ищем первый свободный хост в подсети (пропускаем .0 — адрес сети)
    for (let offset = 1; offset <= totalHosts + 1; offset += 1) {
      const candidate = baseInt + offset;

      if (!usedInts.has(candidate)) {
        return `${this.intToIp(candidate)}/32`;
      }
    }

    throw Object.assign(
      new Error(`Subnet ${serverAddress} is exhausted (no free addresses)`),
      { status: 409 },
    );
  }

  // ─── Вспомогательные методы ────────────────────────────────────────────────

  private parseAddress(cidr: string): { networkBase: string; prefix: number } {
    const [ip, prefixStr] = cidr.split("/");
    const prefix = parseInt(prefixStr, 10);
    const ipInt = this.ipToInt(ip);
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    const networkInt = (ipInt & mask) >>> 0;

    return { networkBase: this.intToIp(networkInt), prefix };
  }

  private ipToInt(ip: string): number {
    return (
      ip
        .split(".")
        .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
    );
  }

  private intToIp(int: number): string {
    return [
      (int >>> 24) & 0xff,
      (int >>> 16) & 0xff,
      (int >>> 8) & 0xff,
      int & 0xff,
    ].join(".");
  }
}

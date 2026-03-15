/* eslint-disable no-bitwise */
import { inject } from "inversify";

import { Injectable } from "../../core";
import { WgPeerRepository } from "./wg-peer.repository";

@Injectable()
export class WgIpAllocatorService {
  constructor(
    @inject(WgPeerRepository) private readonly peerRepo: WgPeerRepository,
  ) {}

  /**
   * Allocate the next free /32 host address within the server's subnet.
   *
   * The server itself occupies the first host (e.g. 10.0.0.1/24 → .1 is taken).
   * We scan existing peers for the server and return the lowest unused host.
   *
   * @param serverAddress  Server VPN address with prefix, e.g. "10.0.0.1/24"
   * @param serverId       Used to query existing peer allocations
   * @returns              e.g. "10.0.0.2/32"
   * @throws               If the subnet is exhausted
   */
  async allocate(serverAddress: string, serverId: string): Promise<string> {
    const { networkBase, prefix } = this.parseAddress(serverAddress);

    const totalHosts = (1 << (32 - prefix)) - 2; // subtract network + broadcast
    const baseInt = this.ipToInt(networkBase);

    // Collect already-used host integers (server + peers)
    const serverHostInt = this.ipToInt(serverAddress.split("/")[0]);
    const usedInts = new Set<number>([serverHostInt]);

    const peers = await this.peerRepo.findByServer(serverId);

    for (const peer of peers) {
      const ip = peer.allowedIPs.split("/")[0];

      usedInts.add(this.ipToInt(ip));
    }

    // Find first free host in the subnet (skip .0 network address)
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

  // ─── Helpers ───────────────────────────────────────────────────────────────

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

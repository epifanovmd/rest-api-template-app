import { exec } from "child_process";
import { promisify } from "util";

import { config } from "../../config";
import { Injectable } from "../../core";

const execAsync = promisify(exec);

export interface WgKeyPair {
  privateKey: string;
  publicKey: string;
}

@Injectable()
export class WgKeyService {
  private readonly wg = config.wireguard.binaryPath;

  /**
   * Generate a WireGuard private key
   */
  async generatePrivateKey(): Promise<string> {
    const { stdout } = await execAsync(`${this.wg} genkey`);

    return stdout.trim();
  }

  /**
   * Derive public key from private key
   */
  async derivePublicKey(privateKey: string): Promise<string> {
    const { stdout } = await execAsync(
      `echo '${privateKey}' | ${this.wg} pubkey`,
    );

    return stdout.trim();
  }

  /**
   * Generate preshared key
   */
  async generatePresharedKey(): Promise<string> {
    const { stdout } = await execAsync(`${this.wg} genpsk`);

    return stdout.trim();
  }

  /**
   * Generate a complete private/public key pair
   */
  async generateKeyPair(): Promise<WgKeyPair> {
    const privateKey = await this.generatePrivateKey();
    const publicKey = await this.derivePublicKey(privateKey);

    return { privateKey, publicKey };
  }
}

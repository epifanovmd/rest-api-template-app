import { exec } from "child_process";
import { promisify } from "util";

import { config } from "../../config";
import { Injectable } from "../../core";

const execAsync = promisify(exec);

export interface WgKeyPair {
  privateKey: string;
  publicKey: string;
}

/** Сервис для генерации криптографических ключей WireGuard через CLI. */
@Injectable()
export class WgKeyService {
  private readonly wg = config.wireguard.binaryPath;

  /**
   * Сгенерировать приватный ключ WireGuard
   */
  async generatePrivateKey(): Promise<string> {
    const { stdout } = await execAsync(`${this.wg} genkey`);

    return stdout.trim();
  }

  /**
   * Получить публичный ключ из приватного ключа
   */
  async derivePublicKey(privateKey: string): Promise<string> {
    const { stdout } = await execAsync(
      `echo '${privateKey}' | ${this.wg} pubkey`,
    );

    return stdout.trim();
  }

  /**
   * Сгенерировать предварительно общий ключ (preshared key)
   */
  async generatePresharedKey(): Promise<string> {
    const { stdout } = await execAsync(`${this.wg} genpsk`);

    return stdout.trim();
  }

  /**
   * Сгенерировать полную пару приватного/публичного ключей
   */
  async generateKeyPair(): Promise<WgKeyPair> {
    const privateKey = await this.generatePrivateKey();
    const publicKey = await this.derivePublicKey(privateKey);

    return { privateKey, publicKey };
  }
}

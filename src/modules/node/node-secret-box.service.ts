import { createHash } from "crypto";

import { config } from "../../config";
import {
  Injectable,
  openSecret,
  parseSecretBoxKey,
  sealSecret,
} from "../../core";
import { nodeConfig } from "./node.config";

/** Ключ из настройки или производный от ключа подписи токенов. */
const resolveKey = (): Buffer =>
  nodeConfig.secretsKey
    ? parseSecretBoxKey(nodeConfig.secretsKey)
    : createHash("sha256")
        .update(`node-secrets:${config.auth.jwt.secretKey}`)
        .digest();

/**
 * Шифрование секретов в данных задач узла (SSH-пароль, ключ, passphrase,
 * токен регистрации): в очереди и журнале они только в таком виде.
 */
@Injectable()
export class NodeSecretBox {
  private readonly _key = resolveKey();

  seal(plain: string): string {
    return sealSecret(plain, this._key);
  }

  open(sealed: string): string {
    return openSecret(sealed, this._key);
  }
}

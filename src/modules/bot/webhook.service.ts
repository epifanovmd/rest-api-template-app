import crypto from "crypto";
import dns from "dns";
import http from "http";
import https from "https";
import { inject } from "inversify";
import net from "net";

import {
  EventBus,
  Injectable,
  JobError,
  JobQueue,
  logger,
  normalizePagination,
  toPage,
} from "../../core";
import { Bot } from "./bot.entity";
import { BotWebhookErrorCode } from "./bot.errors";
import { BotRepository } from "./bot.repository";
import {
  BOT_WEBHOOK_QUEUE,
  IBotWebhookJobData,
  IWebhookAttemptResult,
  WEBHOOK_FAILURE_THRESHOLD,
  WEBHOOK_REQUEST_TIMEOUT_MS,
} from "./bot.types";
import { WebhookLogDto } from "./dto/bot.dto";
import { BotWebhookDisabledEvent } from "./events";
import { WebhookLogRepository } from "./webhook-log.repository";

/** Приватный, loopback или link-local адрес. */
const isPrivateIp = (ip: string): boolean => {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;

  if (net.isIPv4(v4)) {
    const [a, b] = v4.split(".").map(Number);

    return (
      a === 127 ||
      a === 10 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();

    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fe80") ||
      lower.startsWith("fc") ||
      lower.startsWith("fd")
    );
  }

  return false;
};

/**
 * Резолвит хост и проверяет, что ни один адрес не приватный; возвращает
 * адрес для подключения — IP закрепляется в запросе против DNS rebinding.
 */
const resolvePublicHost = async (hostname: string): Promise<string> => {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new JobError(
        BotWebhookErrorCode.BLOCKED,
        `Адрес ${hostname} приватный`,
        false,
      );
    }

    return hostname;
  }

  const addresses = await dns.promises
    .lookup(hostname, { all: true })
    .catch((err: NodeJS.ErrnoException) => {
      throw new JobError(
        BotWebhookErrorCode.DNS_FAILED,
        `DNS ${hostname}: ${err.code ?? err.message}`,
      );
    });

  if (addresses.length === 0) {
    throw new JobError(
      BotWebhookErrorCode.DNS_FAILED,
      `DNS ${hostname}: нет адресов`,
    );
  }

  const blocked = addresses.find(addr => isPrivateIp(addr.address));

  if (blocked) {
    throw new JobError(
      BotWebhookErrorCode.BLOCKED,
      `${hostname} резолвится в приватный адрес ${blocked.address}`,
      false,
    );
  }

  return addresses[0].address;
};

const sign = (secret: string | null, body: string) =>
  secret ? crypto.createHmac("sha256", secret).update(body).digest("hex") : "";

const isSuccessStatus = (status: number) => status >= 200 && status < 300;

interface IWebhookRequest {
  bot: Bot;
  eventType: string;
  body: string;
  extraHeaders?: Record<string, string>;
}

/**
 * Доставка событий на вебхук бота: постановка в очередь `bot.webhook`, одна
 * попытка HTTP-запроса с SSRF-защитой и HMAC-подписью, журнал попыток и
 * автоотключение вебхука после серии провалов.
 */
@Injectable()
export class WebhookService {
  constructor(
    @inject(WebhookLogRepository)
    private readonly _logRepo: WebhookLogRepository,
    @inject(BotRepository) private readonly _botRepo: BotRepository,
    @inject(JobQueue) private readonly _jobs: JobQueue,
    @inject(EventBus) private readonly _eventBus: EventBus,
  ) {}

  /**
   * Поставить доставку события боту в очередь. `null` — бот не подписан на
   * событие, вебхук не задан или отключён.
   */
  async enqueueEvent(
    bot: Bot,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    if (!this._accepts(bot, eventType)) return null;

    const deliveryId = crypto.randomUUID();
    const data: IBotWebhookJobData = {
      botId: bot.id,
      deliveryId,
      eventType,
      payload,
      timestamp: Date.now(),
    };

    return this._jobs.enqueue(BOT_WEBHOOK_QUEUE, data);
  }

  /**
   * Одна попытка доставки из очереди; пишет запись журнала. `null` — доставлять
   * некому (бот удалён или отключён, вебхук снят или отключён, фильтр сменился).
   */
  async attemptDelivery(
    data: IBotWebhookJobData,
    attempt: number,
  ): Promise<IWebhookAttemptResult | null> {
    const bot = await this._botRepo.findOne({ where: { id: data.botId } });

    if (!bot || !this._accepts(bot, data.eventType)) return null;

    const body = JSON.stringify({
      event: data.eventType,
      bot_id: bot.id,
      delivery_id: data.deliveryId,
      timestamp: data.timestamp,
      payload: data.payload,
    });

    const result = await this._send({
      bot,
      eventType: data.eventType,
      body,
      extraHeaders: {
        "X-Bot-Delivery": data.deliveryId,
        "X-Bot-Attempt": String(attempt + 1),
      },
    });

    await this._saveLog(bot.id, data.deliveryId, data.eventType, data.payload, {
      ...result,
      attempt: attempt + 1,
    });

    if (result.success) {
      await this._botRepo.resetWebhookFailures(bot.id);
    }

    return result;
  }

  /**
   * Доставка провалена окончательно (попытки исчерпаны): счётчик провалов
   * растёт, на пороге вебхук отключается и владелец получает событие.
   */
  async registerFailedDelivery(
    botId: string,
    lastError: string | null,
  ): Promise<void> {
    const failures = await this._botRepo.incrementWebhookFailures(botId);

    if (failures < WEBHOOK_FAILURE_THRESHOLD) return;

    const disabled = await this._botRepo.disableWebhookIfFailing(
      botId,
      WEBHOOK_FAILURE_THRESHOLD,
    );

    if (!disabled) return;

    const bot = await this._botRepo.findOne({ where: { id: botId } });

    if (!bot) return;

    logger.warn(
      { botId, failures },
      "[Bot] Webhook disabled after consecutive failures",
    );
    this._eventBus.emit(
      new BotWebhookDisabledEvent(botId, bot.ownerId, failures, lastError),
    );
  }

  /** Тестовый ping: синхронно, одна попытка, без очереди и повторов. */
  async testWebhook(bot: Bot): Promise<{
    success: boolean;
    statusCode: number | null;
    errorMessage: string | null;
    durationMs: number;
  }> {
    if (!bot.webhookUrl) {
      return {
        success: false,
        statusCode: null,
        errorMessage: "Вебхук не настроен",
        durationMs: 0,
      };
    }

    const payload = { test: true };
    const body = JSON.stringify({
      event: "ping",
      bot_id: bot.id,
      timestamp: Date.now(),
      payload,
    });

    const { success, statusCode, errorMessage, durationMs } = await this._send({
      bot,
      eventType: "ping",
      body,
    });

    await this._saveLog(bot.id, null, "ping", payload, {
      success,
      statusCode,
      errorMessage,
      durationMs,
      attempt: 1,
    });

    return { success, statusCode, errorMessage, durationMs };
  }

  /** Журнал доставок бота страницей. */
  /** Удалить записи журнала доставок старше `retentionDays` дней. */
  cleanupLogs(retentionDays: number): Promise<number> {
    const before = new Date();

    before.setDate(before.getDate() - retentionDays);

    return this._logRepo.deleteOlderThan(before);
  }

  async getLogs(botId: string, offset?: number, limit?: number) {
    const page = normalizePagination(offset, limit);
    const [logs, total] = await this._logRepo.findPageByBotId(botId, page);

    return toPage(logs.map(WebhookLogDto.fromEntity), total, page);
  }

  /** Вебхук задан, не отключён и подписан на событие (пустой фильтр — все). */
  private _accepts(bot: Bot, eventType: string) {
    if (!bot.isActive || !bot.webhookUrl || bot.webhookDisabledAt) {
      return false;
    }

    const events = bot.webhookEvents ?? [];

    return events.length === 0 || events.includes(eventType);
  }

  /** Один запрос; ошибки сети и SSRF превращаются в результат, не бросаются. */
  private async _send({
    bot,
    eventType,
    body,
    extraHeaders,
  }: IWebhookRequest): Promise<IWebhookAttemptResult> {
    const startedAt = Date.now();
    const headers = {
      "Content-Type": "application/json",
      "X-Bot-Signature": sign(bot.webhookSecret, body),
      "X-Bot-Event": eventType,
      ...extraHeaders,
    };

    try {
      const statusCode = await this._post(bot.webhookUrl ?? "", body, headers);
      const success = isSuccessStatus(statusCode);

      return {
        success,
        statusCode,
        errorMessage: success ? null : `HTTP ${statusCode}`,
        durationMs: Date.now() - startedAt,
        permanent: false,
      };
    } catch (err) {
      return {
        success: false,
        statusCode: null,
        errorMessage: err instanceof Error ? err.message : "Неизвестная ошибка",
        durationMs: Date.now() - startedAt,
        permanent: err instanceof JobError && !err.retryable,
      };
    }
  }

  private async _saveLog(
    botId: string,
    deliveryId: string | null,
    eventType: string,
    payload: Record<string, unknown>,
    result: Omit<IWebhookAttemptResult, "permanent"> & { attempt: number },
  ) {
    await this._logRepo.createAndSave({
      botId,
      deliveryId,
      eventType,
      payload,
      statusCode: result.statusCode,
      success: result.success,
      errorMessage: result.success ? null : result.errorMessage,
      attempts: result.attempt,
      durationMs: result.durationMs,
    });
  }

  /**
   * POST с SSRF-защитой: хост резолвится и проверяется, IP закрепляется в
   * запросе (защита от DNS rebinding), Host и SNI — исходные.
   */
  private async _post(
    url: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<number> {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(url);
    } catch {
      throw new JobError(
        BotWebhookErrorCode.BLOCKED,
        "Некорректный URL вебхука",
        false,
      );
    }

    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      throw new JobError(
        BotWebhookErrorCode.BLOCKED,
        "Вебхук поддерживает только http и https",
        false,
      );
    }

    const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, "");
    const resolvedIp = await resolvePublicHost(hostname);
    const isHttps = parsedUrl.protocol === "https:";

    return new Promise((resolve, reject) => {
      const client = isHttps ? https : http;

      const req = client.request(
        {
          hostname: resolvedIp,
          port: parsedUrl.port,
          path: parsedUrl.pathname + parsedUrl.search,
          method: "POST",
          headers: {
            ...headers,
            Host: parsedUrl.host,
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: WEBHOOK_REQUEST_TIMEOUT_MS,
          ...(isHttps ? { servername: hostname } : {}),
        },
        res => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );

      req.on("error", (err: Error) => {
        reject(new JobError(BotWebhookErrorCode.NETWORK_ERROR, err.message));
      });
      req.on("timeout", () => {
        reject(
          new JobError(BotWebhookErrorCode.TIMEOUT, "Таймаут запроса вебхука"),
        );
        req.destroy();
      });
      req.write(body);
      req.end();
    });
  }
}

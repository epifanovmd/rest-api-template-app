import crypto from "crypto";
import http from "http";
import https from "https";

import { Injectable, logger } from "../../core";
import { Bot } from "./bot.entity";

@Injectable()
export class WebhookService {
  async deliverEvent(
    bot: Bot,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    if (!bot.webhookUrl) return;

    const body = JSON.stringify({
      event: eventType,
      bot_id: bot.id,
      timestamp: Date.now(),
      payload,
    });

    const signature = bot.webhookSecret
      ? crypto
          .createHmac("sha256", bot.webhookSecret)
          .update(body)
          .digest("hex")
      : "";

    const maxRetries = 3;
    const delays = [1000, 5000, 25000];

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        const statusCode = await this._post(bot.webhookUrl, body, {
          "Content-Type": "application/json",
          "X-Bot-Signature": signature,
          "X-Bot-Event": eventType,
        });

        if (statusCode >= 200 && statusCode < 300) return;

        logger.warn(
          { botId: bot.id, status: statusCode, attempt },
          "Webhook delivery failed",
        );
      } catch (err) {
        logger.error(
          { err, botId: bot.id, attempt },
          "Webhook delivery error",
        );
      }

      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delays[attempt]));
      }
    }

    logger.error(
      { botId: bot.id, url: bot.webhookUrl },
      "Webhook delivery failed after all retries",
    );
  }

  private _post(
    url: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === "https:" ? https : http;

      const req = client.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname + parsedUrl.search,
          method: "POST",
          headers: {
            ...headers,
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: 10000,
        },
        res => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Webhook request timeout"));
      });
      req.write(body);
      req.end();
    });
  }
}

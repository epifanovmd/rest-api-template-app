import crypto from "crypto";
import dns from "dns";
import http from "http";
import https from "https";
import { inject } from "inversify";
import net from "net";

import { Injectable, logger } from "../../core";
import { Bot } from "./bot.entity";
import { WebhookLogRepository } from "./webhook-log.repository";

/** All known webhook event types that bots can subscribe to. */
export const WEBHOOK_EVENT_TYPES = [
  "message",
  "command",
  "message_edited",
  "message_deleted",
  "message_reaction",
  "message_pinned",
  "message_unpinned",
  "member_joined",
  "member_left",
  "member_role_changed",
  "member_banned",
  "member_unbanned",
  "chat_created",
  "chat_updated",
  "poll_created",
  "poll_voted",
  "poll_closed",
  "call_initiated",
  "call_ended",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

// ── SSRF protection ────────────────────────────────────────────────────

/** Returns true if the IP address is private, loopback, or link-local. */
function isPrivateIp(ip: string): boolean {
  // IPv4-mapped IPv6 (::ffff:x.x.x.x) → extract IPv4 part
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;

  if (net.isIPv4(v4)) {
    const parts = v4.split(".").map(Number);
    const [a, b] = parts;

    // 127.0.0.0/8 — loopback
    if (a === 127) return true;
    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 169.254.0.0/16 — link-local (cloud metadata)
    if (a === 169 && b === 254) return true;
    // 0.0.0.0
    if (a === 0) return true;

    return false;
  }

  if (net.isIPv6(ip)) {
    // ::1 loopback
    if (ip === "::1") return true;
    // fe80::/10 link-local
    if (ip.toLowerCase().startsWith("fe80")) return true;
    // fc00::/7 unique-local
    if (
      ip.toLowerCase().startsWith("fc") ||
      ip.toLowerCase().startsWith("fd")
    ) {
      return true;
    }

    return false;
  }

  return false;
}

/**
 * Resolves hostname to IP and checks it is not private/internal.
 * Throws if the resolved IP is blocked — prevents DNS rebinding attacks.
 */
async function assertPublicHost(hostname: string): Promise<string> {
  // If hostname is already an IP literal — check directly
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error(
        `Webhook blocked: ${hostname} resolves to a private address`,
      );
    }

    return hostname;
  }

  return new Promise((resolve, reject) => {
    dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (err) {
        reject(new Error(`DNS lookup failed for ${hostname}: ${err.message}`));

        return;
      }

      if (!addresses || addresses.length === 0) {
        reject(new Error(`DNS lookup returned no addresses for ${hostname}`));

        return;
      }

      for (const addr of addresses) {
        if (isPrivateIp(addr.address)) {
          reject(
            new Error(
              `Webhook blocked: ${hostname} resolves to private address ${addr.address}`,
            ),
          );

          return;
        }
      }

      // Return first address for pinned connection
      resolve(addresses[0].address);
    });
  });
}

// ── Service ────────────────────────────────────────────────────────────

@Injectable()
export class WebhookService {
  constructor(
    @inject(WebhookLogRepository)
    private readonly _logRepo: WebhookLogRepository,
  ) {}

  /**
   * Deliver a webhook event to the bot's URL.
   * Retries up to 3 times with exponential backoff.
   * Saves a delivery log regardless of success/failure.
   */
  async deliverEvent(
    bot: Bot,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    if (!bot.webhookUrl) return;

    // Check event filter — empty array means "all events"
    if (
      bot.webhookEvents &&
      bot.webhookEvents.length > 0 &&
      !bot.webhookEvents.includes(eventType)
    ) {
      return;
    }

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

    const headers = {
      "Content-Type": "application/json",
      "X-Bot-Signature": signature,
      "X-Bot-Event": eventType,
    };

    const maxRetries = 3;
    const delays = [1000, 5000, 25000];
    let lastStatusCode: number | null = null;
    let lastError: string | null = null;
    let success = false;
    let attempts = 0;
    const startTime = Date.now();

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      attempts = attempt + 1;

      try {
        const statusCode = await this._post(bot.webhookUrl, body, headers);

        lastStatusCode = statusCode;

        if (statusCode >= 200 && statusCode < 300) {
          success = true;
          break;
        }

        lastError = `HTTP ${statusCode}`;
        logger.warn(
          { botId: bot.id, status: statusCode, attempt },
          "Webhook delivery failed",
        );
      } catch (err: any) {
        lastError = err?.message ?? "Unknown error";
        logger.error(
          { err, botId: bot.id, attempt },
          "Webhook delivery error",
        );
      }

      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delays[attempt]));
      }
    }

    if (!success) {
      logger.error(
        { botId: bot.id, url: bot.webhookUrl },
        "Webhook delivery failed after all retries",
      );
    }

    // Save delivery log
    const durationMs = Date.now() - startTime;

    await this._logRepo.createAndSave({
      botId: bot.id,
      eventType,
      payload,
      statusCode: lastStatusCode,
      success,
      errorMessage: success ? null : lastError,
      attempts,
      durationMs,
    });
  }

  /**
   * Send a test "ping" event to verify webhook connectivity.
   * Does NOT retry — returns result immediately.
   */
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
        errorMessage: "No webhook URL configured",
        durationMs: 0,
      };
    }

    const body = JSON.stringify({
      event: "ping",
      bot_id: bot.id,
      timestamp: Date.now(),
      payload: { test: true },
    });

    const signature = bot.webhookSecret
      ? crypto
          .createHmac("sha256", bot.webhookSecret)
          .update(body)
          .digest("hex")
      : "";

    const startTime = Date.now();
    let statusCode: number | null = null;
    let errorMessage: string | null = null;
    let success = false;

    try {
      statusCode = await this._post(bot.webhookUrl, body, {
        "Content-Type": "application/json",
        "X-Bot-Signature": signature,
        "X-Bot-Event": "ping",
      });
      success = statusCode >= 200 && statusCode < 300;
      if (!success) errorMessage = `HTTP ${statusCode}`;
    } catch (err: any) {
      errorMessage = err?.message ?? "Unknown error";
    }

    const durationMs = Date.now() - startTime;

    // Log the test delivery too
    await this._logRepo.createAndSave({
      botId: bot.id,
      eventType: "ping",
      payload: { test: true },
      statusCode,
      success,
      errorMessage,
      attempts: 1,
      durationMs,
    });

    return { success, statusCode, errorMessage, durationMs };
  }

  /**
   * Get delivery logs for a bot (paginated).
   */
  async getLogs(botId: string, options?: { limit?: number; offset?: number }) {
    return this._logRepo.findByBotId(botId, options);
  }

  /**
   * POST request with SSRF protection.
   * 1. Resolves hostname to IP via DNS
   * 2. Checks resolved IP is not private/internal
   * 3. Pins the resolved IP in the request to prevent DNS rebinding
   */
  private async _post(
    url: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<number> {
    const parsedUrl = new URL(url);

    // SSRF guard — resolve and validate before connecting
    const resolvedIp = await assertPublicHost(parsedUrl.hostname);

    return new Promise((resolve, reject) => {
      const client = parsedUrl.protocol === "https:" ? https : http;

      const req = client.request(
        {
          // Pin resolved IP to prevent DNS rebinding
          hostname: resolvedIp,
          port: parsedUrl.port,
          path: parsedUrl.pathname + parsedUrl.search,
          method: "POST",
          headers: {
            ...headers,
            // Preserve original Host header for virtual hosts
            Host: parsedUrl.host,
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: 10000,
          // For HTTPS — use original hostname for SNI/TLS verification
          ...(parsedUrl.protocol === "https:"
            ? { servername: parsedUrl.hostname }
            : {}),
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

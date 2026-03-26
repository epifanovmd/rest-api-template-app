import { load as cheerioLoad } from "cheerio";
import http from "http";
import https from "https";
import { inject } from "inversify";

import { Injectable, logger } from "../../core";
import { LinkPreviewRepository } from "./link-preview.repository";

export interface ILinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

@Injectable()
export class LinkPreviewService {
  private static readonly URL_REGEX =
    /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

  private static readonly MAX_PREVIEWS = 3;
  private static readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    @inject(LinkPreviewRepository) private _repo: LinkPreviewRepository,
  ) {}

  /** Извлечь URL из текстового содержимого. */
  extractUrls(content: string): string[] {
    const matches = content.match(LinkPreviewService.URL_REGEX);

    return matches ? [...new Set(matches)] : [];
  }

  /** Получить preview для URL (с кешированием в БД). */
  async fetchPreview(url: string): Promise<ILinkPreviewData | null> {
    try {
      // Check cache
      const cached = await this._repo.findByUrl(url);

      if (
        cached &&
        Date.now() - cached.fetchedAt.getTime() < LinkPreviewService.CACHE_TTL_MS
      ) {
        return {
          url: cached.url,
          title: cached.title,
          description: cached.description,
          imageUrl: cached.imageUrl,
          siteName: cached.siteName,
        };
      }

      // Fetch page using native http/https
      const html = await this._httpGet(url);

      if (!html) return null;

      const $ = cheerioLoad(html);

      const title =
        $("meta[property=\"og:title\"]").attr("content") ??
        $("title").text() ??
        null;
      const description =
        $("meta[property=\"og:description\"]").attr("content") ??
        $("meta[name=\"description\"]").attr("content") ??
        null;
      const imageUrl =
        $("meta[property=\"og:image\"]").attr("content") ?? null;
      const siteName =
        $("meta[property=\"og:site_name\"]").attr("content") ?? null;

      const previewData: ILinkPreviewData = {
        url,
        title: title ? title.slice(0, 500) : null,
        description: description ? description.slice(0, 1000) : null,
        imageUrl: imageUrl ? imageUrl.slice(0, 2048) : null,
        siteName: siteName ? siteName.slice(0, 200) : null,
      };

      // Upsert to cache
      if (cached) {
        cached.title = previewData.title;
        cached.description = previewData.description;
        cached.imageUrl = previewData.imageUrl;
        cached.siteName = previewData.siteName;
        cached.fetchedAt = new Date();
        await this._repo.save(cached);
      } else {
        await this._repo.createAndSave({
          ...previewData,
          fetchedAt: new Date(),
        });
      }

      return previewData;
    } catch (error) {
      logger.warn({ err: error, url }, "Failed to fetch link preview");

      return null;
    }
  }

  /** Получить previews для всех URL в тексте (макс 3). */
  async getPreviewsForContent(
    content: string,
  ): Promise<ILinkPreviewData[]> {
    const urls = this.extractUrls(content).slice(
      0,
      LinkPreviewService.MAX_PREVIEWS,
    );

    if (urls.length === 0) return [];

    const results = await Promise.allSettled(
      urls.map(url => this.fetchPreview(url)),
    );

    return results
      .filter(
        (r): r is PromiseFulfilledResult<ILinkPreviewData | null> =>
          r.status === "fulfilled" && r.value !== null,
      )
      .map(r => r.value!);
  }

  /** HTTP GET с таймаутом 5 секунд. Возвращает HTML или null. */
  private _httpGet(url: string): Promise<string | null> {
    return new Promise(resolve => {
      const client = url.startsWith("https") ? https : http;

      const req = client.get(
        url,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; LinkPreviewBot/1.0)",
            Accept: "text/html",
          },
          timeout: 5000,
        },
        res => {
          const contentType = res.headers["content-type"] ?? "";

          if (
            res.statusCode !== 200 ||
            !contentType.includes("text/html")
          ) {
            res.resume();
            resolve(null);

            return;
          }

          const chunks: Buffer[] = [];
          let totalLength = 0;
          const maxSize = 512 * 1024; // 512KB limit

          res.on("data", (chunk: Buffer) => {
            totalLength += chunk.length;
            if (totalLength > maxSize) {
              res.destroy();
              resolve(null);

              return;
            }
            chunks.push(chunk);
          });

          res.on("end", () => {
            resolve(Buffer.concat(chunks).toString("utf-8"));
          });

          res.on("error", () => resolve(null));
        },
      );

      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });

      req.on("error", () => resolve(null));
    });
  }
}

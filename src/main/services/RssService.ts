import Parser from "rss-parser";
import store from "../config/store";
import { logger } from "../utils/logger";

export interface FeedItem {
  title: string;
  link: string;
  pubDate: string;
  contentSnippet?: string;
  source: string;
  isoDate: string;
}

export class RssService {
  private parser: Parser;

  constructor() {
    this.parser = new Parser({
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      requestOptions: {
        rejectUnauthorized: false,
      },
    });
  }

  public async fetchAllFeeds(
    forceRefresh: boolean = false
  ): Promise<FeedItem[]> {
    if (!forceRefresh) {
      const cache = store.get("feedCache");
      const cacheAge = Date.now() - (cache?.lastUpdated || 0);
      const ONE_HOUR = 60 * 60 * 1000;

      if (
        cache &&
        cache.items &&
        cache.items.length > 0 &&
        cacheAge < ONE_HOUR
      ) {
        logger.info(`RSS 캐시 사용: ${cache.items.length}개 항목`);
        return cache.items;
      }
    }

    const urls = store.get("settings").rssUrls || [];
    if (urls.length === 0) return [];

    logger.info(`RSS 수집 시작: ${urls.length}개의 소스`);

    const feedPromises = urls.map(async (url) => {
      try {
        const feed = await this.parser.parseURL(url);
        const items = feed.items.map((item) => ({
          title: item.title || "No Title",
          link: item.link || "",
          pubDate: item.pubDate || "",
          contentSnippet: item.contentSnippet?.slice(0, 150) + "..." || "",
          source: feed.title || "Unknown Source",
          isoDate: item.isoDate || new Date().toISOString(),
        }));
        return items;
      } catch (error) {
        logger.error(`RSS 파싱 실패 (${url}): ${error}`);
        return [];
      }
    });

    const results = await Promise.all(feedPromises);
    const allItems = results.flat().sort((a, b) => {
      return new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime();
    });

    store.set("feedCache", {
      items: allItems,
      lastUpdated: Date.now(),
    });

    logger.info(`RSS 수집 완료: ${allItems.length}개 항목`);
    return allItems;
  }

  public filterByPeriod(items: FeedItem[], days: number): FeedItem[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return items.filter((item) => {
      const itemDate = new Date(item.isoDate);
      return itemDate >= cutoffDate;
    });
  }
}

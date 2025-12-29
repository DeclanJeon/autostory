import Parser from "rss-parser";
import store, { isLinkPublished } from "../config/store";
import { logger } from "../utils/logger";

export interface FeedItem {
  title: string;
  link: string;
  pubDate: string;
  contentSnippet?: string;
  source: string;
  isoDate: string;
  isPublished: boolean; // [NEW] 발행 여부 플래그 추가
}

export class RssService {
  private parser: Parser;
  private readonly FEED_TIMEOUT = 15000; // [NEW] 15초 타임아웃

  constructor() {
    this.parser = new Parser({
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      requestOptions: {
        rejectUnauthorized: false,
        timeout: this.FEED_TIMEOUT, // [NEW] 타임아웃 설정
      },
    });
  }

  /**
   * [NEW] 단일 RSS 피드 요청에 타임아웃 적용
   */
  private async fetchWithTimeout<T>(
    promise: Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("Request timeout")), timeout)
      ),
    ]);
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
        // [FIX] 캐시된 아이템이라도 발행 여부는 최신 상태로 업데이트해서 반환
        return cache.items.map((item) => ({
          ...item,
          isPublished: isLinkPublished(item.link),
        }));
      }
    }

    const urls = store.get("settings").rssUrls || [];
    if (urls.length === 0) return [];

    logger.info(`RSS 수집 시작: ${urls.length}개의 소스`);

    // [NEW] 각 피드 요청에 개별 타임아웃 적용
    const feedPromises = urls.map(async (url) => {
      try {
        const feedPromise = this.parser.parseURL(url);
        const feed = await this.fetchWithTimeout(
          feedPromise,
          this.FEED_TIMEOUT
        );

        const items = feed.items.map((item) => ({
          title: item.title || "No Title",
          link: item.link || "",
          pubDate: item.pubDate || "",
          contentSnippet: item.contentSnippet?.slice(0, 150) + "..." || "",
          source: feed.title || "Unknown Source",
          isoDate: item.isoDate || new Date().toISOString(),
          // [NEW] 스토어에서 발행 여부 확인
          isPublished: isLinkPublished(item.link || ""),
        }));
        return items;
      } catch (error) {
        logger.error(
          `RSS 파싱 실패 (${url}): ${
            error instanceof Error ? error.message : error
          }`
        );
        return []; // [NEW] 실패 시 빈 배열 반환하여 계속 진행
      }
    });

    // [NEW] 모든 요청 완료 대기 (타임아웃된 것들은 빈 배열로 처리됨)
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

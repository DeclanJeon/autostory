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
        return cache.items.map((item) => ({
          ...item,
          isPublished: isLinkPublished(item.link),
        }));
      }
    }

    const urls = store.get("settings").rssUrls || [];
    if (urls.length === 0) return [];

    logger.info(`RSS 수집 시작: ${urls.length}개의 소스 (순차 처리)`);

    const allItems: FeedItem[] = [];
    let successCount = 0;
    let failCount = 0;
    const failedUrls: string[] = [];

    // [CHANGED] 순차 처리로 변경 (서버 및 로컬 부하 감소)
    for (const url of urls) {
      try {
        const feedPromise = this.parser.parseURL(url);
        // 타임아웃 10초로 단축
        const feed = await this.fetchWithTimeout(feedPromise, 10000);

        if (feed && feed.items) {
          const items = feed.items.map((item) => ({
            title: item.title || "No Title",
            link: item.link || "",
            pubDate: item.pubDate || "",
            contentSnippet: item.contentSnippet?.slice(0, 150) + "..." || "",
            source: feed.title || "Unknown Source",
            isoDate: item.isoDate || new Date().toISOString(),
            isPublished: isLinkPublished(item.link || ""),
          }));
          allItems.push(...items);
          successCount++;
        }

        // 부하 방지를 위한 미세 딜레이
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        failCount++;
        // [IMPROVED] 개별 에러는 로그에 남기되 ERROR 레벨이 아닌 경고로 처리하거나 요약
        const msg = error instanceof Error ? error.message : String(error);
        failedUrls.push(`${url} (${msg})`);
      }
    }

    // 결과 요약 로깅
    if (failCount > 0) {
      logger.warn(`RSS 수집 완료: 성공 ${successCount}, 실패 ${failCount}`);
      // 실패 내역은 디버그 레벨이나 UI에 영향을 덜 주는 방식으로 로깅
      // logger.debug(`실패한 RSS: ${failedUrls.join(", ")}`);
    } else {
      logger.info(`RSS 수집 완료: ${allItems.length}개 항목 (모두 성공)`);
    }

    const sortedItems = allItems.sort((a, b) => {
      return new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime();
    });

    store.set("feedCache", {
      items: sortedItems,
      lastUpdated: Date.now(),
    });

    return sortedItems;
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

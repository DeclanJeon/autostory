# [1/4단계] 시스템 고도화 설계서: 로그, RSS, 문맥 기반 발행 연동

## 1. Analysis Section (분석)

본 문서는 `autotistory-ai-writer` 시스템의 사용성 개선, 성능 최적화, 그리고 발행 지능화를 위한 기술적 설계를 다룹니다. 사용자의 요구사항은 크게 **UI 경험 개선(로그 스크롤)**, **시스템 안정성 확보(RSS 순차 처리)**, **컨텐츠 일관성 유지(문맥 기반 카테고리 매칭)**의 세 가지 영역으로 구분됩니다. 각 영역에 대한 상세 분석과 아키텍처 수립 방향은 다음과 같습니다.

### 1-1. 대시보드 시스템 로그의 사용성 문제 분석

현재 대시보드의 `LogMonitor` 컴포넌트는 새로운 로그가 수신될 때마다 `scrollIntoView`를 강제 호출하도록 구현되어 있습니다 (`useEffect` 의존성). 이는 실시간 모니터링에는 유리하나, 사용자가 과거 로그를 확인하기 위해 스크롤을 올렸을 때 즉시 최하단으로 강제 이동되는 'Scroll Jacking' 현상을 유발하여 UX를 심각하게 저해합니다.
또한, 컨테이너의 높이가 고정(`h-[250px]`)되어 있어 다량의 로그 발생 시 가독성이 떨어지며, `overflow-y` 속성은 존재하나 강제 스크롤 로직과 충돌하여 실질적인 탐색이 불가능한 상태입니다.
이를 해결하기 위해서는 **Smart Auto-Scrolling** 패턴을 도입해야 합니다. 즉, 스크롤바가 최하단(또는 그에 준하는 임계값 내)에 위치할 때만 자동 스크롤을 수행하고, 사용자가 임의로 위로 올렸을 때는 자동 스크롤을 일시 중지하는 로직이 필요합니다.

### 1-2. RSS 로딩 방식의 구조적 한계 및 부하 분산 전략

기존 `RssService.fetchAllFeeds` 메서드는 `Promise.all`과 `map`을 사용하여 등록된 모든 RSS URL에 대해 동시 다발적인 비동기 요청을 수행합니다. 이는 Node.js의 Event Loop를 일시적으로 블로킹할 수 있을 뿐만 아니라, 대상 서버(RSS 제공처)로부터 'Too Many Requests (429)' 차단을 유발하거나, 로컬 네트워크 대역폭을 순간적으로 점유하여 다른 중요 프로세스(예: AI 생성, 이미지 다운로드)의 지연을 초래할 수 있습니다.
또한, 특정 URL이 404(Not Found) 또는 500(Server Error) 상태일 때, 이를 일반 에러로 처리하여 로그에 붉은색 에러 메시지를 남발하는 것은 운영자에게 불필요한 알람 피로(Alert Fatigue)를 줍니다.
따라서, **Sequential Chaining(순차적 체이닝)** 또는 **Concurrency Limiting(동시성 제한)** 패턴으로의 전환이 필수적입니다. 본 설계에서는 시스템 부하를 최소화하기 위해 완전 순차 처리(`for...of` 루프) 방식을 채택하며, 실패한 요청에 대해서는 `ERROR` 레벨이 아닌 `WARN` 또는 별도의 집계 로그로 처리하여 노이즈를 줄이는 전략을 수립합니다.

### 1-3. 문맥 기반 게시글 연결(Contextual Linking)의 기술적 과제

가장 핵심적인 요구사항인 "이전 포스트와의 연관성 분석 및 카테고리/홈주제 동기화"는 SEO 관점에서 **Topic Clustering(주제 군집화)** 효과를 극대화할 수 있는 매우 중요한 기능입니다. 이를 구현하기 위해서는 단순한 URL 기록(`publishedPosts`)을 넘어선 **메타데이터 아카이빙(Metadata Archiving)**이 선행되어야 합니다.
현재 스토어(`store.ts`)는 발행된 글의 ID나 링크만 저장하고 있어, 과거 글의 '내용(Title, Body)'이나 '속성(Category, HomeTheme)'을 참조할 수 없습니다. 따라서 데이터 스키마 확장이 필요합니다.

또한, "연관성 판단"을 위한 알고리즘 선정이 중요합니다.

1.  **Vector Embedding**: 정확도는 높으나 임베딩 모델 로딩 또는 외부 API 비용이 발생합니다.
2.  **TF-IDF**: 구현이 복잡하고 불용어 처리가 까다롭습니다.
3.  **Keyword Jaccard Similarity**: 구현이 간단하고, 연산 비용이 낮으며, 키워드 매칭 여부를 직관적으로 확인할 수 있어 유지보수에 유리합니다.

본 시스템은 로컬 데스크톱 애플리케이션임을 감안하여, **유사도 판단 알고리즘**으로 **Jaccard Coefficient** 기반의 키워드 매칭 방식을 채택합니다. AI가 생성한 '키워드' 집합을 저장해두고, 신규 글의 키워드와 교집합 비율을 계산하여 임계값(Threshold, 예: 0.3)을 넘는 가장 유사한 글의 설정을 상속받는 구조로 설계합니다.

---

## 2. Solutions Section (솔루션)

### 2-1. UI 개선 솔루션

1.  **Smart Auto-Scroll Logic**: `useRef`를 사용하여 사용자의 스크롤 위치를 추적하고, 바닥에 붙어있을 때만(`scrollHeight - scrollTop === clientHeight`) 새 로그 수신 시 스크롤을 내립니다.
2.  **Scroll State Management**: 사용자가 스크롤을 올리면 `isUserScrolling` 상태를 활성화하여 자동 스크롤을 차단하고, "맨 아래로 이동" 버튼을 노출합니다.
3.  **Visual Feedback**: 스크롤, 대역폭 차단 시 시각적 피드백(일시정지 아이콘 등)을 제공하여 사용자가 시스템 상태를 인지하도록 합니다.
4.  **Log Virtualization (Optional)**: 로그가 1000줄을 넘어갈 경우 DOM 부하를 줄이기 위해 `react-window` 등의 가상화 도입을 고려하되, 현재는 배열 `slice` 방식으로 최적화합니다.

### 2-2. RSS 안정화 솔루션

5.  **Sequential Async Loop**: `Promise.all` 대신 `for...of` 루프와 `await`를 사용하여 한 번에 하나의 RSS 피드만 요청하도록 변경합니다.
6.  **Soft 404 Handling**: RSS 요청 실패 시 `try-catch` 블록에서 에러를 포착하고, `console.error` 대신 상태 리포트 객체에만 실패 횟수를 기록하여 최종 리포트 때 한 번만 출력합니다.
7.  **Adaptive Timeout**: 정상 응답 속도에 따라 타임아웃을 동적으로 조절하거나, 실패한 호스트에 대해서는 다음 요청 시 쿨다운을 적용합니다.

### 2-3. 데이터 및 로직 솔루션

8.  **Expanded History Schema**: `store.ts`에 `publishedPostDetails` 배열을 추가하여 `{ id, title, keywords, category, homeTheme, publishedAt }` 구조체로 저장합니다.
9.  **Jaccard Similarity Algorithm**: 두 개의 키워드 배열을 입력받아 유사도(0.0 ~ 1.0)를 반환하는 유틸리티 함수를 구현합니다. 수식: $$ J(A,B) = \frac{|A \cap B|}{|A \cup B|} $$
10. **Contextual Override Logic**: 발행 직전(`AutomationService`), 저장된 모든 기록과 현재 글의 유사도를 계산하고, 최고 점수가 임계값(0.3) 이상일 경우 해당 기록의 `category`와 `homeTheme`를 현재 설정에 덮어씌웁니다.

---

## 3. Mathematical Formulas

유사도 판단을 위한 자카드 유사도(Jaccard Similarity) 공식은 다음과 같습니다.
$A$는 신규 게시글의 키워드 집합, $B$는 기존 게시글의 키워드 집합일 때:

$$
J(A, B) = \frac{|A \cap B|}{|A \cup B|} = \frac{|A \cap B|}{|A| + |B| - |A \cap B|}
$$

- $J(A, B) = 1$: 두 게시글의 키워드가 완벽하게 일치함 (동일 주제)
- $J(A, B) = 0$: 겹치는 키워드가 하나도 없음 (무관)
- 임계값(Threshold): $\theta = 0.3$ (30% 이상 겹치면 연관된 시리즈로 판단)

---

## 4. Code Blocks

### 4-1. Smart Log Monitor (Dashboard.tsx)

```tsx
/**
 * 스마트 오토 스크롤이 적용된 로그 모니터 컴포넌트
 * 사용자가 스크롤을 올리면 자동 스크롤이 멈춥니다.
 */
const LogMonitor = memo(
  ({ logs, onClear }: { logs: string[]; onClear: () => void }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);

    // 스크롤 이벤트 핸들러: 사용자가 스크롤을 위로 올렸는지 감지
    const handleScroll = () => {
      if (!scrollRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;

      // 바닥에서 50px 이내면 오토 스크롤 재활성화, 아니면 비활성화
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    };

    useEffect(() => {
      if (autoScroll && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, [logs, autoScroll]);

    return (
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="overflow-y-auto h-[250px] ..."
      >
        {/* Logs Render */}
      </div>
    );
  }
);
```

### 4-2. Sequential RSS Fetcher (RssService.ts)

```typescript
/**
 * 순차적 RSS 수집 메서드
 * 시스템 부하를 줄이고 에러 로깅을 최소화합니다.
 */
public async fetchAllFeedsSequential(): Promise<FeedItem[]> {
  const urls = store.get("settings").rssUrls || [];
  const results: FeedItem[] = [];
  const errors: string[] = [];

  for (const url of urls) {
    try {
      // 순차 처리: 하나가 완료되어야 다음으로 넘어감
      const feedPromise = this.parser.parseURL(url);
      const feed = await this.fetchWithTimeout(feedPromise, 5000); // 짧은 타임아웃

      const items = feed.items.map(item => ({
        // ... 매핑 로직 ...
      }));
      results.push(...items);
    } catch (e: any) {
      // 에러를 던지지 않고 수집만 함 (로그 오염 방지)
      errors.push(`${url}: ${e.message}`);
    }
    // 부하 분산을 위한 아주 짧은 지연 (Optional)
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (errors.length > 0) {
    logger.warn(`RSS 수집 중 ${errors.length}건의 오류가 발생했습니다. (세부사항 생략)`);
  }

  return results.sort((a, b) => new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime());
}
```

### 4-3. Contextual Similarity Logic (AutomationService.ts)

```typescript
/**
 * 게시글 이력 저장 인터페이스
 */
interface PublishedPostDetail {
  id: string; // URL or UUID
  title: string;
  keywords: string[]; // AI가 추출한 핵심 키워드
  category: string;
  homeTheme: string;
  publishedAt: number;
}

/**
 * 자카드 유사도 계산 유틸리티
 */
function calculateJaccardSimilarity(setA: string[], setB: string[]): number {
  const intersection = setA.filter(k => setB.includes(k));
  const union = new Set([...setA, ...setB]);
  return intersection.length / union.size;
}

/**
 * 적합한 카테고리/홈주제 자동 매칭 로직
 */
public findMatchingContext(
  currentTitle: string,
  currentKeywords: string[],
  history: PublishedPostDetail[]
): { category: string; homeTheme: string } | null {

  let bestMatch: PublishedPostDetail | null = null;
  let maxScore = 0;
  const THRESHOLD = 0.3; // 30% 이상 일치

  for (const post of history) {
    const score = calculateJaccardSimilarity(currentKeywords, post.keywords);
    if (score > maxScore) {
      maxScore = score;
      bestMatch = post;
    }
  }

  if (bestMatch && maxScore >= THRESHOLD) {
    logger.info(`🔄 연관 게시글 감지: "${bestMatch.title}" (유사도: ${maxScore.toFixed(2)})`);
    return {
      category: bestMatch.category,
      homeTheme: bestMatch.homeTheme
    };
  }

  return null;
}
```

## 다음 단계

설계를 기반으로 `Dashboard.tsx`의 스크롤 개선, `RSS` 순차 처리, 그리고 `store.ts` 스키마 확장을 순차적으로 구현합니다.

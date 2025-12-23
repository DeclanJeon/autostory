export interface PresetFeed {
  category: string;
  name: string;
  url: string;
  description?: string;
}

export const recommendedFeeds: PresetFeed[] = [
  // Reddit Deals & Promotions
  { category: "Deals", name: "Reddit Deals", url: "https://www.reddit.com/r/deals/.rss", description: "General Deals" },
  { category: "Deals", name: "Reddit DealsReddit", url: "https://www.reddit.com/r/DealsReddit/.rss", description: "Internet Deals" },
  { category: "Deals", name: "Reddit BuildAPCSales", url: "https://www.reddit.com/r/buildapcsales/.rss", description: "PC Parts" },
  { category: "Deals", name: "Reddit Frugal", url: "https://www.reddit.com/r/frugal/.rss", description: "Frugal Living" },
  { category: "Deals", name: "Reddit TechDeals", url: "https://www.reddit.com/r/techdeals/.rss", description: "Tech Deals" },
  { category: "Deals", name: "Reddit HardwareDeals", url: "https://www.reddit.com/r/hardwaredeals/.rss", description: "Hardware Deals" },
  { category: "Deals", name: "Reddit LaptopDeals", url: "https://www.reddit.com/r/laptopdeals/.rss", description: "Laptop Deals" },
  { category: "Deals", name: "Reddit SoftwareDeals", url: "https://www.reddit.com/r/SoftwareDeals/.rss", description: "Software Deals" },
  { category: "Deals", name: "Reddit AI_Deals", url: "https://www.reddit.com/r/AI_Deals/.rss", description: "AI Tools Deals" },
  { category: "Deals", name: "Reddit AppSumo", url: "https://www.reddit.com/r/AppSumo/.rss", description: "Lifetime Deals" },
  { category: "Deals", name: "Reddit Coupons", url: "https://www.reddit.com/r/coupons/.rss", description: "Coupons" },
  { category: "Deals", name: "Reddit PromoCodes", url: "https://www.reddit.com/r/PromoCodes/.rss", description: "Promo Codes" },

  // Reddit News & Tech
  { category: "Overseas News", name: "Reddit WorldNews", url: "https://www.reddit.com/r/worldnews/.rss" },
  { category: "Overseas News", name: "Reddit News", url: "https://www.reddit.com/r/news/.rss" },
  { category: "Overseas News", name: "Reddit Politics", url: "https://www.reddit.com/r/politics/.rss" },
  { category: "Tech", name: "Reddit Technology", url: "https://www.reddit.com/r/technology/.rss" },

  // Overseas Forums
  { category: "Tech", name: "Hacker News", url: "https://news.ycombinator.com/rss" },
  { category: "Tech", name: "4chan /g/", url: "https://boards.4chan.org/g/index.rss" },
  { category: "Politics", name: "4chan /pol/", url: "https://boards.4chan.org/pol/index.rss" },
  { category: "Tech", name: "Stack Overflow", url: "https://stackoverflow.com/feeds" },
  { category: "Tech", name: "XDA Developers", url: "https://forum.xda-developers.com/rss" },
  { category: "Tech", name: "Spiceworks", url: "https://community.spiceworks.com/rss" },
  { category: "Music", name: "Ultimate Guitar", url: "https://www.ultimate-guitar.com/forum/rss" },
  { category: "Marketing", name: "Warrior Forum", url: "https://www.warriorforum.com/rss" },

  // Overseas News Media
  { category: "Overseas News", name: "BBC News", url: "http://feeds.bbci.co.uk/news/rss.xml" },
  { category: "Overseas News", name: "CNN", url: "http://rss.cnn.com/rss/cnn_topstories.rss" },
  { category: "Overseas News", name: "NY Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml" },
  { category: "Overseas News", name: "The Guardian", url: "https://www.theguardian.com/world/rss" },
  { category: "Overseas News", name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { category: "Overseas News", name: "Fox News", url: "http://feeds.foxnews.com/foxnews/latest" },

  // Korean News
  { category: "Domestic News", name: "Daum News", url: "https://news.daum.net/rss" },
  { category: "Domestic News", name: "Chosun Ilbo", url: "https://www.chosun.com/arc/outboundfeeds/rss/" },
  { category: "Domestic News", name: "Joongang Ilbo", url: "https://www.joongang.co.kr/rss" },
  { category: "Domestic News", name: "Hankyoreh", url: "https://www.hani.co.kr/rss/" },
  { category: "Domestic News", name: "Yonhap News", url: "https://www.yna.co.kr/rss" },
  { category: "Domestic News", name: "JTBC News", url: "https://news.jtbc.co.kr/rss" },
  { category: "Domestic News", name: "SBS News", url: "https://news.sbs.co.kr/news/rss.do" },

  // Korean Communities
  { category: "Community", name: "Clien", url: "https://www.clien.net/service/rss" },
  { category: "Community", name: "Ppomppu", url: "https://www.ppomppu.co.kr/rss/" },
  { category: "Game", name: "Inven", url: "https://www.inven.co.kr/rss" },

  // Tech News
  { category: "Tech News", name: "Slashdot", url: "https://slashdot.org/slashdot.rss" },
  { category: "Tech News", name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { category: "Tech News", name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { category: "Tech News", name: "Engadget", url: "https://www.engadget.com/rss.xml" },
  { category: "Tech News", name: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { category: "Tech News", name: "Wired", url: "https://www.wired.com/feed/rss" },

  // Economy
  { category: "Economy", name: "Bloomberg", url: "https://www.bloomberg.com/feed/rss" },
  { category: "Economy", name: "WSJ", url: "https://feeds.wsj.com/WSJ/com/rss" },
  { category: "Economy", name: "Financial Times", url: "https://www.ft.com/rss" },

  // Sports & Ent
  { category: "Sports", name: "ESPN", url: "http://www.espn.com/espn/rss/news" },
  { category: "Game", name: "IGN", url: "https://feeds.ign.com/ign/all" },
  { category: "Entertainment", name: "TMZ", url: "https://www.tmz.com/rss" },
  { category: "Entertainment", name: "People", url: "https://people.com/feed/" },
];

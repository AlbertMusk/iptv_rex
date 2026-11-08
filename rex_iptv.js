// 央视频全频道直播 ForwardWidget 模块
// 数据源: https://iptv.55white.xyz:8888 （央视频 63 路直播，HLS/m3u8）
// 频道列表从首页 HTML 解析，分类：央视 / 卫视 / 其他

WidgetMetadata = {
  id: "ysp.rex.live",
  title: "央视频直播",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "央视频全频道直播（CCTV / CGTN / 各省卫视），m3u8 直播源，延迟约 20 秒",
  author: "rex",
  site: "https://iptv.55white.xyz:8888",
  modules: [
    {
      id: "loadList",
      title: "频道列表",
      functionName: "loadList",
      cacheDuration: 1800,
      requiresWebView: false,
      params: [
        {
          name: "category",
          title: "频道分类",
          type: "enumeration",
          value: "全部",
          enumOptions: [
            { title: "全部", value: "全部" },
            { title: "央视", value: "央视" },
            { title: "卫视", value: "卫视" },
            { title: "其他", value: "其他" },
          ],
        },
      ],
    },
    {
      id: "loadAll",
      title: "聚合播放",
      functionName: "loadAll",
      cacheDuration: 1800,
      requiresWebView: false,
      params: [],
    },
  ],
  search: {
    title: "搜索频道",
    functionName: "search",
    params: [
      { name: "keyword", title: "频道关键词", type: "input" },
    ],
  },
};

const BASE = "https://iptv.55white.xyz:8888";
const LIST_URL = `${BASE}/`;
const ALL_M3U_URL = `${BASE}/all.m3u`;
const PREFIX = "[ysp.rex.live]";

// 从首页 HTML 解析频道列表，返回 [{ slug, title, category }]
async function fetchChannels() {
  const res = await Widget.http.get(LIST_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" },
  });
  const html = typeof res.data === "string" ? res.data : String(res.data || "");
  if (!html) throw new Error("频道列表响应为空");

  const $ = Widget.html.load(html);
  const channels = [];
  const seen = new Set();

  $("li a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").trim();
    const m = href.match(/^\/([a-z0-9-]+)\.m3u8$/i);
    if (!m) return; // 排除 /all.m3u 等非频道链接
    const slug = m[1].toLowerCase();
    if (seen.has(slug)) return;
    seen.add(slug);
    const title = ($(el).text() || "").trim() || slug;
    channels.push({ slug, title, category: detectCategory(title, slug) });
  });

  if (channels.length === 0) throw new Error("未解析到任何频道");
  return channels;
}

function detectCategory(title, slug) {
  const name = `${title} ${slug}`.toLowerCase();
  if (/cctv|cetv|cgtn|央视|国学/.test(name)) return "央视";
  if (/卫视/.test(title)) return "卫视";
  return "其他";
}

function toVideoItem(ch) {
  return {
    id: `ysp:${ch.slug}`,
    type: "url",
    title: ch.title,
    videoUrl: `${BASE}/${ch.slug}.m3u8`,
    description: `${ch.category} · 直播`,
  };
}

// 频道列表模块
async function loadList(params = {}) {
  try {
    const channels = await fetchChannels();
    const category = String(params.category || "全部");
    const filtered =
      category === "全部" ? channels : channels.filter((c) => c.category === category);
    return filtered.map(toVideoItem);
  } catch (error) {
    console.error(`${PREFIX} loadList 失败:`, error.message || error);
    throw error;
  }
}

// 聚合播放模块：返回单条 /all.m3u 聚合订阅条目
async function loadAll(params = {}) {
  try {
    return [
      {
        id: "ysp:all",
        type: "url",
        title: "央视频全频道聚合",
        videoUrl: ALL_M3U_URL,
        description: "63 路频道一次导入，播放器内切换",
      },
    ];
  } catch (error) {
    console.error(`${PREFIX} loadAll 失败:`, error.message || error);
    throw error;
  }
}

// 顶层搜索：按关键词过滤频道
async function search(params = {}) {
  try {
    const keyword = String(params.keyword || "").trim().toLowerCase();
    if (!keyword) return [];
    const channels = await fetchChannels();
    return channels
      .filter(
        (c) =>
          c.title.toLowerCase().includes(keyword) ||
          c.slug.includes(keyword)
      )
      .map(toVideoItem);
  } catch (error) {
    console.error(`${PREFIX} search 失败:`, error.message || error);
    throw error;
  }
}

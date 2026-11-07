WidgetMetadata = {
  id: "iptv.remote.cctv",
  title: "央视频道(远程M3U)",
  version: "1.1.0",
  requiredVersion: "0.0.1",
  description: "远程拉取m3u源：iptv.55white.xyz:8888/all.m3u，link直接存储播放地址",
  author: "dev",
  site: "https://iptv.55white.xyz:8888/all.m3u",
  detailCacheDuration: 30,
  modules: [
    {
      id: "loadIptvList",
      title: "全部频道",
      functionName: "loadIptvList",
      cacheDuration: 300,
      params: []
    },
    {
      id: "loadResource",
      title: "获取播放源",
      functionName: "loadResource",
      type: "stream",
      cacheDuration: 0,
      params: []
    }
  ],
  search: {
    title: "搜索频道",
    functionName: "searchIptv",
    params: [
      { name: "keyword", title: "关键词", type: "input" }
    ]
  }
};

/**
 * m3u解析：提取频道标题、播放url
 */
function parseM3u(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => !!l);
  const items = [];
  let meta = null;
  for (const line of lines) {
    if (line.startsWith("#EXTM3U")) continue;
    if (line.startsWith("#EXTINF:")) {
      let logo = "";
      let group = "默认分组";
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      if (logoMatch) logo = logoMatch[1];
      const groupMatch = line.match(/group-title="([^"]+)"/);
      if (groupMatch) group = groupMatch[1];
      const titleCommaIdx = line.lastIndexOf(",");
      const title = titleCommaIdx > -1 ? line.slice(titleCommaIdx + 1) : "未知频道";
      meta = { title, logo, group };
    } else if (!line.startsWith("#") && meta) {
      const url = line;
      items.push({
        title: meta.title,
        logo: meta.logo,
        group: meta.group,
        url: url
      });
      meta = null;
    }
  }
  return items;
}

async function fetchM3uContent() {
  const m3uUrl = "https://iptv.55white.xyz:8888/all.m3u";
  const res = await Widget.http.get(m3uUrl);
  return res.data;
}

async function loadIptvList(params = {}) {
  try {
    const text = await fetchM3uContent();
    const channels = parseM3u(text);
    if (!Array.isArray(channels) || channels.length === 0) {
      console.error("[loadIptvList] m3u解析未得到频道");
      return [{
        id: "empty",
        type: "url",
        mediaType: "tv",
        title: "⚠️解析m3u未获取频道",
        coverUrl: "",
        link: ""
      }];
    }
    return channels.map((ch, idx) => {
      return {
        id: String(idx),
        type: "url",
        mediaType: "tv",
        title: ch.title,
        coverUrl: ch.logo || "",
        // link直接赋值完整播放url，不再加iptv:xxx@@@封装
        link: ch.url
      };
    });
  } catch (error) {
    console.error("[loadIptvList] 获取m3u失败：", error.message || error);
    return [{
      id: "neterr",
      type: "url",
      mediaType: "tv",
      title: "⚠️远程m3u获取失败",
      coverUrl: "",
      link: ""
    }];
  }
}

// loadDetail：接收link字符串，link此时就是播放url；仅填充详情UI
async function loadDetail(link) {
  try {
    if (!link) return null;
    return {
      id: link,
      type: "url",
      mediaType: "tv",
      title: "IPTV直播频道",
      coverUrl: "",
      link: link
    };
  } catch (error) {
    console.error("[loadDetail] 异常：", error.message || error);
    return null;
  }
}

// loadResource：params.link 直接就是m3u播放地址
async function loadResource(params = {}) {
  try {
    const playUrl = params.link;
    if (!playUrl) {
      console.warn("[loadResource] link为空");
      return [];
    }
    if (!playUrl.startsWith("http://") && !playUrl.startsWith("https://")) {
      console.warn("[loadResource] 协议不支持：", playUrl);
      return [];
    }
    console.log("[loadResource] 播放地址：", playUrl);
    return [
      {
        name: "直播线路",
        description: "远程IPTV源",
        url: playUrl,
        playerType: "app"
      }
    ];
  } catch (error) {
    console.error("[loadResource] 异常：", error.message || error);
    return [];
  }
}

async function searchIptv(params = {}) {
  try {
    const kw = (params.keyword || "").toLowerCase().trim();
    const text = await fetchM3uContent();
    const channels = parseM3u(text);
    if (!kw) {
      return channels.map((ch, idx) => ({
        id: "s_" + idx,
        type: "url",
        mediaType: "tv",
        title: ch.title,
        coverUrl: ch.logo || "",
        link: ch.url
      }));
    }
    const filtered = channels.filter(ch => ch.title.toLowerCase().includes(kw));
    if (filtered.length === 0) {
      return [{
        id: "search-empty",
        type: "url",
        mediaType: "tv",
        title: "🔍搜索无匹配频道",
        coverUrl: "",
        link: ""
      }];
    }
    return filtered.map((ch, idx) => ({
      id: "s_" + idx,
      type: "url",
      mediaType: "tv",
      title: ch.title,
      coverUrl: ch.logo || "",
      link: ch.url
    }));
  } catch (error) {
    console.error("[searchIptv] 搜索异常：", error.message || error);
    return [{
      id: "search-err",
      type: "url",
      mediaType: "tv",
      title: "⚠️搜索请求失败",
      coverUrl: "",
      link: ""
    }];
  }
}

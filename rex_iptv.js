WidgetMetadata = {
  id: "iptv.live",
  title: "IPTV直播源",
  version: "1.1.0",
  requiredVersion: "0.0.1",
  description: "加载外部m3u IPTV直播源，storage缓存减少网络请求，源：raw.githubusercontent.com/AlbertMusk/iptv_rex/refs/heads/main/list.m3u",
  author: "dev",
  site: "",
  detailCacheDuration: 60,
  modules: [
    {
      id: "loadList",
      title: "直播频道列表",
      functionName: "loadList",
      cacheDuration: 0,
      requiresWebView: false,
      params: [
        {
          name: "page",
          title: "页码",
          type: "page"
        }
      ]
    },
    {
      id: "loadResource",
      title: "获取直播播放地址",
      functionName: "loadResource",
      type: "stream",
      cacheDuration: 0,
      params: []
    }
  ],
  search: {
    title: "搜索频道",
    functionName: "search",
    params: [
      {
        name: "keyword",
        title: "频道名称",
        type: "input"
      },
      {
        name: "page",
        title: "页码",
        type: "page"
      }
    ]
  }
};

// ==========配置项==========
const M3U_URL = "https://raw.githubusercontent.com/AlbertMusk/iptv_rex/refs/heads/main/list.m3u";
const M3U_CACHE_TTL = 300; // 缓存有效期，单位秒，5分钟
const STORAGE_KEY_TEXT = "iptv_m3u_text";
const STORAGE_KEY_TIMESTAMP = "iptv_m3u_ts";

/**
 * m3u解析器，修复group-title连字符bug
 * @param {string} text m3u原始文本
 * @returns {Array<{tvgName:string,groupTitle:string,name:string,url:string}>}
 */
function parseM3u(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => !!l);
  const items = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith("#EXTINF:")) {
      let tvgName = "";
      let groupTitle = "";
      const tvgMatch = line.match(/tvg-name="([^"]*)"/);
      if (tvgMatch) tvgName = tvgMatch[1];
      const groupMatch = line.match(/group-title="([^"]*)"/);
      if (groupMatch) groupTitle = groupMatch[1];
      const commaPos = line.lastIndexOf(",");
      let name = "";
      if (commaPos !== -1) name = line.slice(commaPos + 1).trim();
      current = { tvgName, groupTitle, name, url: "" };
    } else if (!line.startsWith("#") && current) {
      current.url = line;
      items.push({ ...current });
      current = null;
    }
  }
  return items;
}

/**
 * 获取m3u内容，优先storage缓存，过期自动重新请求
 * @returns {{ok:boolean,channels:Array,errorMsg:string}}
 */
async function fetchAllChannels() {
  const now = Math.floor(Date.now() / 1000);
  try {
    // 读取缓存
    const cachedTsRaw = Widget.storage.get(STORAGE_KEY_TIMESTAMP);
    const cachedText = Widget.storage.get(STORAGE_KEY_TEXT);
    const cachedTs = Number(cachedTsRaw || 0);

    // 判断缓存是否有效
    if (cachedText && (now - cachedTs) < M3U_CACHE_TTL) {
      console.log("[iptv] 使用storage缓存m3u");
      const channels = parseM3u(cachedText);
      return { ok: true, channels, errorMsg: "" };
    }

    // 缓存失效，发起网络请求
    console.log("[iptv] 重新请求远程m3u源");
    const resp = await Widget.http.get(M3U_URL);
    const m3uText = resp.data || "";

    // 写入storage缓存
    Widget.storage.set(STORAGE_KEY_TEXT, m3uText);
    Widget.storage.set(STORAGE_KEY_TIMESTAMP, String(now));

    const channels = parseM3u(m3uText);
    return { ok: true, channels, errorMsg: "" };

  } catch (err) {
    const msg = err?.message || String(err);
    console.error("[iptv] 获取m3u源失败:", msg);
    return { ok: false, channels: [], errorMsg: msg };
  }
}

/**
 * 频道对象转VideoItem
 * @param {*} ch
 * @param {number} idx
 * @returns VideoItem
 */
function channelToVideoItem(ch, idx) {
  return {
    id: String(idx),
    type: "url",
    mediaType: "movie",
    title: ch.name || ch.tvgName || "未知频道",
    coverUrl: "",
    link: `ch:${idx}`,
    description: `分组:${ch.groupTitle || "无分组"}`,
  };
}

/**
 * 生成提示用的占位VideoItem（网络失败/解析0频道提示）
 */
function makeHintItem(title, desc) {
  return {
    id: "hint",
    type: "url",
    mediaType: "movie",
    title: title,
    coverUrl: "",
    link: "hint:-1",
    description: desc
  };
}

async function loadList(params = {}) {
  try {
    const page = Number(params.page || 1);
    const res = await fetchAllChannels();

    // 网络请求失败，返回提示条目
    if (!res.ok) {
      return [makeHintItem("⚠️获取直播源失败，请稍后重试", res.errorMsg)];
    }
    const allCh = res.channels;
    // 解析成功但是0频道
    if (allCh.length === 0) {
      return [makeHintItem("⚠️解析m3u未得到任何频道", "源返回内容为空或者m3u格式异常")];
    }

    const pageSize = 40;
    const start = (page - 1) * pageSize;
    const pageItems = allCh.slice(start, start + pageSize);
    return pageItems.map((ch, i) => channelToVideoItem(ch, start + i));

  } catch (error) {
    console.error("[loadList] 异常:", error.message || error);
    throw error;
  }
}

async function search(params = {}) {
  try {
    const keyword = String(params.keyword || "").toLowerCase();
    const page = Number(params.page || 1);
    if (!keyword) return [];

    const res = await fetchAllChannels();
    if (!res.ok) {
      return [makeHintItem("⚠️获取直播源失败，无法搜索", res.errorMsg)];
    }
    const allCh = res.channels;
    if (allCh.length === 0) {
      return [makeHintItem("⚠️解析m3u未得到任何频道，无法搜索", "")];
    }

    const filtered = allCh.filter(c => {
      const t = (c.name + " " + c.tvgName + " " + c.groupTitle).toLowerCase();
      return t.includes(keyword);
    });

    const pageSize = 40;
    const start = (page - 1) * pageSize;
    const pageItems = filtered.slice(start, start + pageSize);
    return pageItems.map((ch, i) => channelToVideoItem(ch, start + i));

  } catch (error) {
    console.error("[search]异常:", error.message || error);
    throw error;
  }
}

async function loadDetail(link) {
  if (!link) return null;
  // 提示占位条目直接返回基础对象
  if (link.startsWith("hint:")) {
    return { id: link, type: "url", title: link, link };
  }
  if (!link.startsWith("ch:")) return null;
  return {
    id: link,
    type: "url",
    title: "直播频道",
    link
  };
}

async function loadResource(params = {}) {
  try {
    const link = params.link;
    if (!link || !link.startsWith("ch:")) {
      // 提示条目hint:-1直接返回空线路，禁止播放
      return [];
    }
    const idx = parseInt(link.replace("ch:", ""), 10);
    if (isNaN(idx)) return [];

    const res = await fetchAllChannels();
    if (!res.ok) return [];
    const allCh = res.channels;

    // 索引越界保护
    if (idx < 0 || idx >= allCh.length) {
      console.warn("[loadResource] 频道索引越界 idx=" + idx);
      return [];
    }
    const ch = allCh[idx];
    if (!ch || !ch.url) {
      console.warn("[loadResource] 该频道播放地址为空");
      return [];
    }

    return [
      {
        name: ch.name,
        description: `分组：${ch.groupTitle || "无分组"}`,
        url: ch.url,
        playerType: "app",
        customHeaders: {
          "User-Agent": "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
          "X-Forward-Skip-Redirect-Probe": "1"
        }
      }
    ];
  } catch (error) {
    console.error("[loadResource]异常", error.message || error);
    return [];
  }
}

WidgetMetadata = {
  id: "iptv.live",
  title: "IPTV直播源",
  version: "1.3.0",
  requiredVersion: "0.0.1",
  description: "加载外部m3u IPTV直播源，内置调试面板，storage缓存减少网络请求，gh‑proxy代理github源",
  author: "dev",
  site: "",
  detailCacheDuration: 20,
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
const M3U_URL = "https://gh-proxy.org/https://raw.githubusercontent.com/AlbertMusk/iptv_rex/refs/heads/main/list.m3u";
const M3U_CACHE_TTL = 300; // 缓存有效期，单位秒，5分钟
const STORAGE_KEY_TEXT = "iptv_m3u_text";
const STORAGE_KEY_TIMESTAMP = "iptv_m3u_ts";
const STORAGE_KEY_LAST_ERROR = "iptv_last_err";
const DEBUG_LINK_ID = "debug:info";

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
 * 清除本地缓存
 */
async function clearCache() {
  Widget.storage.remove(STORAGE_KEY_TEXT);
  Widget.storage.remove(STORAGE_KEY_TIMESTAMP);
  Widget.storage.remove(STORAGE_KEY_LAST_ERROR);
  console.log("[iptv] 已清空本地m3u缓存");
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

    // 写入storage缓存，同时清空上次错误
    Widget.storage.set(STORAGE_KEY_TEXT, m3uText);
    Widget.storage.set(STORAGE_KEY_TIMESTAMP, String(now));
    Widget.storage.remove(STORAGE_KEY_LAST_ERROR);

    const channels = parseM3u(m3uText);
    return { ok: true, channels, errorMsg: "" };

  } catch (err) {
    const msg = err?.message || String(err);
    console.error("[iptv] 获取m3u源失败:", msg);
    Widget.storage.set(STORAGE_KEY_LAST_ERROR, msg);
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

async function loadList(params = {}) {
  try {
    const page = Number(params.page || 1);
    const res = await fetchAllChannels();

    let list = [];
    // 第一页，插入调试入口条目
    if(page === 1){
      list.push({
        id: DEBUG_LINK_ID,
        type: "url",
        mediaType: "movie",
        title: "🔧调试信息（点击查看）",
        coverUrl: "",
        link: DEBUG_LINK_ID,
        description: "查看缓存、网络、解析状态，排查未加载资源问题"
      });
    }

    // ⚠️ 网络失败/0频道只保留调试条目，其余返回空数组
    if (!res.ok || res.channels.length === 0) {
      console.warn("[loadList] 无可用频道数据 ok=", res.ok, "count=", res.channels.length);
      return list;
    }

    const allCh = res.channels;
    const pageSize = 40;
    const start = (page - 1) * pageSize;
    const pageItems = allCh.slice(start, start + pageSize);
    list = list.concat(pageItems.map((ch, i) => channelToVideoItem(ch, start + i)));
    return list;

  } catch (error) {
    console.error("[loadList] 异常:", error.message || error);
    return [];
  }
}

async function search(params = {}) {
  try {
    const keyword = String(params.keyword || "").toLowerCase();
    const page = Number(params.page || 1);
    if (!keyword) return [];

    const res = await fetchAllChannels();
    if (!res.ok || res.channels.length === 0) {
      console.warn("[search] 无可用频道");
      return [];
    }
    const allCh = res.channels;

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
    return [];
  }
}

async function loadDetail(link) {
  if (!link) return null;

  // =========调试详情页渲染逻辑=========
  if(link === DEBUG_LINK_ID){
    const now = Math.floor(Date.now() / 1000);
    const cachedTsRaw = Widget.storage.get(STORAGE_KEY_TIMESTAMP);
    const cachedText = Widget.storage.get(STORAGE_KEY_TEXT) || "";
    const lastErr = Widget.storage.get(STORAGE_KEY_LAST_ERROR) || "无错误";
    const cachedTs = Number(cachedTsRaw || 0);
    const cacheValid = cachedText && (now - cachedTs) < M3U_CACHE_TTL;
    const remainTtl = cacheValid ? (M3U_CACHE_TTL - (now - cachedTs)) : 0;
    const previewText = cachedText.substring(0,800);
    const channels = parseM3u(cachedText || "");

    const debugDesc = `
【M3U源地址】
${M3U_URL}

【缓存状态】
缓存有效: ${cacheValid?"✅是":"❌否"}
缓存时间戳: ${cachedTs>0?new Date(cachedTs*1000).toLocaleString():"无缓存"}
剩余过期秒数: ${remainTtl}s

【解析统计】
解析出频道总数: ${channels.length}

【最近一次错误】
${lastErr}

【M3U内容预览(前800字符)】
${previewText}
${cachedText.length>800?"\n......(内容已截断)":""}

💡排错提示：
1. 缓存无效=未成功下载m3u；
2. 错误信息可以看到403/超时；
3. rex设置清除模块存储=清空全部缓存；
`.replace(/\n+/g,"\n");

    return {
      id: DEBUG_LINK_ID,
      type:"url",
      title:"🔧 IPTV模块调试面板",
      link:DEBUG_LINK_ID,
      description: debugDesc
    }
  }

  // 普通频道详情
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
    // 调试面板禁止播放
    if(link === DEBUG_LINK_ID) return [];
    if (!link || !link.startsWith("ch:")) {
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

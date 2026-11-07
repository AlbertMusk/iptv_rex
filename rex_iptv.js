WidgetMetadata = {
  id: "iptv.remote",
  title: "远程IPTV",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "加载远程m3u8 IPTV源，在rex观看直播频道",
  author: "dev",
  site: "https://raw.githubusercontent.com/AlbertMusk/iptv_rex/refs/heads/main/list.m3u",
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
 * m3u简易解析，只处理 #EXTINF 行，输出 [{title,logo,group,url}]
 */
function parseM3u(text) {
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>!!l);
  const items = [];
  let meta = null;
  for(const line of lines) {
    if(line.startsWith("#EXTM3U")) continue;
    if(line.startsWith("#EXTINF:")) {
      // 解析 tvg-logo group-title ,title
      let logo = "";
      let group = "默认分组";
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      if(logoMatch) logo = logoMatch[1];
      const groupMatch = line.match(/group-title="([^"]+)"/);
      if(groupMatch) group = groupMatch[1];
      const titleCommaIdx = line.lastIndexOf(",");
      const title = titleCommaIdx > -1 ? line.slice(titleCommaIdx+1) : "未知频道";
      meta = { title, logo, group };
    } else if(!line.startsWith("#") && meta) {
      items.push({
        title: meta.title,
        logo: meta.logo,
        group: meta.group,
        url: line
      });
      meta = null;
    }
  }
  return items;
}

// 获取原始m3u文本
async function fetchM3uContent() {
  const m3uUrl = "https://raw.githubusercontent.com/AlbertMusk/iptv_rex/refs/heads/main/list.m3u";
  const res = await Widget.http.get(m3uUrl);
  return res.data;
}

async function loadIptvList(params = {}) {
  try {
    const text = await fetchM3uContent();
    const channels = parseM3u(text);
    return channels.map((ch, idx)=>{
      const link = `iptv:${idx}`;
      return {
        id: String(idx),
        type: "url",
        mediaType: "tv",
        title: ch.title,
        coverUrl: ch.logo || "",
        link: link,
        // 把频道原始播放地址编码存入link，loadDetail/loadResource解析
        // link格式 iptv:idx|originalUrl
        link: `iptv:${idx}|${encodeURIComponent(ch.url)}`
      };
    });
  } catch(error) {
    console.error("[loadIptvList] 失败：", error.message||error);
    throw error;
  }
}

// loadDetail：接收link字符串，type:url条目
async function loadDetail(link) {
  try {
    if(!link || !link.startsWith("iptv:")) return null;
    const parts = link.split("|");
    if(parts.length <2) return null;
    const originalUrl = decodeURIComponent(parts[1]);
    return {
      id: link,
      type: "url",
      mediaType: "tv",
      title: "IPTV直播",
      link: link,
      videoUrl: originalUrl
    };
  } catch(error) {
    console.error("[loadDetail] 失败：", error.message||error);
    return null;
  }
}

// loadResource type:stream，本站模块来源校验：只处理 link 以 iptv: 开头
async function loadResource(params = {}) {
  try {
    const linkVal = params.link;
    if(!linkVal || !String(linkVal).startsWith("iptv:")) {
      return [];
    }
    const parts = String(linkVal).split("|");
    if(parts.length < 2) return [];
    const playUrl = decodeURIComponent(parts[1]);
    return [
      {
        name: "直播线路",
        description: "IPTV源",
        url: playUrl,
        playerType: "app"
      }
    ];
  } catch(error) {
    console.error("[loadResource] 失败：", error.message||error);
    return [];
  }
}

async function searchIptv(params = {}) {
  try {
    const kw = (params.keyword || "").toLowerCase();
    if(!kw) return [];
    const text = await fetchM3uContent();
    const channels = parseM3u(text);
    const filtered = channels.filter(ch=> ch.title.toLowerCase().includes(kw));
    return filtered.map((ch, idx)=>{
      const link = `iptv:s_${idx}|${encodeURIComponent(ch.url)}`;
      return {
        id: "s_"+idx,
        type: "url",
        mediaType: "tv",
        title: ch.title,
        coverUrl: ch.logo || "",
        link: link
      };
    });
  } catch(error) {
    console.error("[searchIptv] 搜索失败：", error.message||error);
    throw error;
  }
}

WidgetMetadata = {
  id: "iptv.remote",
  title: "远程IPTV",
  version: "1.0.2",
  requiredVersion: "0.0.1",
  description: "加载远程m3u8 IPTV源，在rex观看直播频道，源：iptv.55white.xyz:8888",
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
 * m3u简易解析，只处理 #EXTINF 行，输出 [{title,logo,group,url}]
 */
function parseM3u(text) {
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>!!l);
  const items = [];
  let meta = null;
  for(const line of lines) {
    if(line.startsWith("#EXTM3U")) continue;
    if(line.startsWith("#EXTINF:")) {
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
      let url = line;
      // 将 rtsp:// 强制替换为 https://
      if(url.startsWith("rtsp://")) {
        url = url.replace(/^rtsp:\/\//, "https://");
      }
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
    if(!Array.isArray(channels) || channels.length === 0) {
      console.error("[loadIptvList] 解析m3u完成，但未获取到任何频道");
      return [{
        id:"error",
        type:"url",
        mediaType:"tv",
        title:"⚠️解析失败：未获取到频道列表",
        coverUrl:"",
        link:"iptv:error@@@"
      }];
    }
    return channels.map((ch, idx)=>{
      const link = `iptv:${idx}@@@${ch.url}`;
      return {
        id: String(idx),
        type: "url",
        mediaType: "tv",
        title: ch.title,
        coverUrl: ch.logo || "",
        link: link
      };
    });
  } catch(error) {
    console.error("[loadIptvList] 获取源失败：", error.message||error);
    return [{
      id:"error",
      type:"url",
      mediaType:"tv",
      title:"⚠️内容获取失败，无法拉取IPTV源",
      coverUrl:"",
      link:"iptv:error@@@"
    }];
  }
}

async function loadDetail(link) {
  try {
    if(!link || !String(link).startsWith("iptv:")) return null;
    const parts = String(link).split("@@@");
    if(parts.length <2) return null;
    const originalUrl = parts[1];
    return {
      id: link,
      type: "url",
      mediaType: "tv",
      title: "IPTV直播",
      coverUrl: "",
      link: link
    };
  } catch(error) {
    console.error("[loadDetail] 失败：", error.message||error);
    return null;
  }
}

async function loadResource(params = {}) {
  try {
    const linkVal = params.link;
    if(!linkVal || !String(linkVal).startsWith("iptv:")) {
      console.log("[loadResource] 拒绝非本模块link：", linkVal);
      return [];
    }
    const parts = String(linkVal).split("@@@");
    if(parts.length < 2) {
      console.error("[loadResource] link解析失败", linkVal);
      return [];
    }
    const playUrl = parts[1];
    if(!playUrl || playUrl.length === 0) {
      console.warn("[loadResource] 播放地址为空");
      return [];
    }
    // 只允许 http / https 协议
    if(!playUrl.startsWith("http://") && !playUrl.startsWith("https://")) {
      console.warn("[loadResource] 不支持的协议：", playUrl);
      return [];
    }
    console.log("[loadResource] 得到播放地址：", playUrl);
    return [
      {
        name: "直播线路",
        description: "IPTV源",
        url: playUrl,
        playerType: "app"
      }
    ];
  } catch(error) {
    console.error("[loadResource] 异常：", error.message||error);
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
    if(filtered.length === 0) {
      return [{
        id:"search-empty",
        type:"url",
        mediaType:"tv",
        title:"🔍搜索无匹配频道",
        coverUrl:"",
        link:"iptv:search-empty@@@"
      }];
    }
    return filtered.map((ch, idx)=>{
      const link = `iptv:s_${idx}@@@${ch.url}`;
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
    return [{
      id:"search-error",
      type:"url",
      mediaType:"tv",
      title:"⚠️搜索获取内容失败",
      coverUrl:"",
      link:"iptv:search-error@@@"
    }];
  }
}

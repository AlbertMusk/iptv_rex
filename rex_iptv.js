WidgetMetadata = {
  id: "iptv.remote",
  title: "远程IPTV",
  version: "1.0.1",
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
      // link格式 iptv:idx@@@原始url，改用@@@分隔，避免url内部有|冲突，不做encode
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
    console.error("[loadIptvList] 失败：", error.message||error);
    throw error;
  }
}

// loadDetail只填充详情页UI展示，不提供播放地址！播放地址交给loadResource
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

// loadResource：type="stream"，起播时调用，必须返回线路数组
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
    console.log("[loadResource] 得到播放地址：", playUrl);

    // rtsp协议rex播放器支持很差，如果是rtsp直接返回空
    if(playUrl.startsWith("rtsp://")){
      console.warn("[loadResource] rtsp不被支持，跳过", playUrl);
      return [];
    }

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
    throw error;
  }
}

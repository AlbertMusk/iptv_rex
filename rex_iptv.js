WidgetMetadata = {
  id: "iptv.live",
  title: "IPTV直播源",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "加载外部m3u IPTV直播源，播放电视直播",
  author: "dev",
  site: "",
  detailCacheDuration: 60,
  modules: [
    {
      id: "loadList",
      title: "直播频道列表",
      functionName: "loadList",
      cacheDuration: 300,
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

const M3U_URL = "https://raw.githubusercontent.com/AlbertMusk/iptv_rex/refs/heads/main/list.m3u";

function parseM3u(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => !!l);
  const items = [];
  let current = null;
  for(const line of lines) {
    if(line.startsWith("#EXTINF:")) {
      let tvgName = "";
      let groupTitle = "";
      const tvgMatch = line.match(/tvg-name="([^"]*)"/);
      if(tvgMatch) tvgName = tvgMatch[1];
      const groupMatch = line.match(/group‑title="([^"]*)"/);
      if(groupMatch) groupTitle = groupMatch[1];
      const commaPos = line.lastIndexOf(",");
      let name = "";
      if(commaPos !== -1) name = line.slice(commaPos+1).trim();
      current = { tvgName, groupTitle, name, url: "" };
    } else if(!line.startsWith("#") && current) {
      current.url = line;
      items.push({...current});
      current = null;
    }
  }
  return items;
}

async function fetchAllChannels() {
  try {
    const resp = await Widget.http.get(M3U_URL);
    const m3uText = resp.data;
    return parseM3u(m3uText);
  } catch(err) {
    console.error("[iptv] 获取m3u源失败", err.message);
    return [];
  }
}

function channelToVideoItem(ch, idx) {
  return {
    id: String(idx),
    type: "url",
    mediaType: "movie",
    title: ch.name || ch.tvgName || "未知频道",
    coverUrl: "",
    link: `ch:${idx}`,
    description: `分组:${ch.groupTitle||"无分组"}`,
  };
}

async function loadList(params = {}) {
  try {
    const page = Number(params.page || 1);
    const allCh = await fetchAllChannels();
    const pageSize = 40;
    const start = (page-1)*pageSize;
    const pageItems = allCh.slice(start, start+pageSize);
    return pageItems.map((ch,i)=>channelToVideoItem(ch, start+i));
  } catch(error) {
    console.error("[loadList] 异常:", error.message||error);
    throw error;
  }
}

async function search(params = {}) {
  try {
    const keyword = String(params.keyword || "").toLowerCase();
    const page = Number(params.page||1);
    if(!keyword) return [];
    const allCh = await fetchAllChannels();
    const filtered = allCh.filter(c=>{
      const t = (c.name + " " + c.tvgName + " " + c.groupTitle).toLowerCase();
      return t.includes(keyword);
    });
    const pageSize =40;
    const start = (page-1)*pageSize;
    const pageItems = filtered.slice(start, start+pageSize);
    return pageItems.map((ch,i)=>channelToVideoItem(ch, start+i));
  } catch(error) {
    console.error("[search]异常:", error.message||error);
    throw error;
  }
}

async function loadDetail(link) {
  if(!link || !link.startsWith("ch:")) return null;
  return {
    id: link,
    type:"url",
    title:"直播频道",
    link
  };
}

async function loadResource(params={}) {
  try {
    const link = params.link;
    if(!link || !link.startsWith("ch:")) return [];
    const idx = parseInt(link.replace("ch:",""),10);
    const allCh = await fetchAllChannels();
    const ch = allCh[idx];
    if(!ch || !ch.url) return [];
    return [
      {
        name: ch.name,
        description: `分组：${ch.groupTitle||"无分组"}`,
        url: ch.url,
        playerType:"app",
        customHeaders:{
          "User-Agent":"Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
          "X-Forward-Skip-Redirect-Probe":"1"
        }
      }
    ];
  } catch(error) {
    console.error("[loadResource]异常", error.message||error);
    return [];
  }
}

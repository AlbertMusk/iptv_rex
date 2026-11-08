// 央视频全频道直播 ForwardWidget 模块（基于 iptv.js 的 M3U 解析框架）
// 数据源: https://iptv.55white.xyz:8888/all.m3u
// 说明: 该 M3U 为极简格式，无 tvg-logo / group-title，因此分组与台标按频道名前缀推导
// 台标源: https://raw.githubusercontent.com/CCSH/IPTV/refs/heads/main/logo/{频道名}.png

var DEFAULT_M3U_URL = 'https://iptv.55white.xyz:8888/all.m3u';

// 台标源与 rex 竖版海报尺寸（2:3）
var LOGO_HOST_PATH = 'raw.githubusercontent.com/CCSH/IPTV/refs/heads/main/logo';
var POSTER_W = 600;
var POSTER_H = 900;
var BACKDROP_W = 1200;
var BACKDROP_H = 500;

// 频道 slug 与台标文件名不一致的特例
var LOGO_OVERRIDES = {
  cctv5p: 'CCTV5+',
  cctv4k: 'CCTV4K',
  cctv8k: 'CCTV8K',
  cctv164k: 'CCTV16',
  cctvfyjc: 'CCTV风云剧场',
  cctvdyjc: 'CCTV第一剧场',
  cctvhjjc: 'CCTV怀旧剧场',
  cgtnfr: 'CGTN法语',
  cgtnru: 'CGTN俄语',
  cgtnar: 'CGTN阿拉伯语',
  cgtnes: 'CGTN西班牙语',
  cgtndoc: 'CGTN纪录',
  cetv1: 'CETV1',
  guoxue: '国学频道',
};

function createIptvModule() {
  return {
    id: 'iptv',
    title: 'IPTV',
    description: '按 M3U 分组浏览并直接播放 IPTV 频道',
    functionName: 'loadList',
    cacheDuration: 300,
    params: [
      { name: 'source', title: 'M3U 地址', type: 'constant', value: DEFAULT_M3U_URL },
      {
        name: 'group',
        title: '分类',
        type: 'enumeration',
        value: '全部',
        enumOptions: [
          { title: '全部', value: '全部' },
          { title: '央视', value: '央视' },
          { title: 'CGTN', value: 'CGTN' },
          { title: '剧场', value: '剧场' },
          { title: '卫视', value: '卫视' },
          { title: '其他', value: '其他' },
        ],
      },
      { name: 'page', title: '页码', type: 'page' },
      { name: 'count', title: '数量', type: 'count', value: '100' },
    ],
  };
}

var WidgetMetadata = {
  id: 'ysp.rex.live',
  title: '央视频直播',
  description: '读取 all.m3u 播放列表，按分组浏览并直接播放央视频道，含台标竖版海报',
  author: 'rex',
  site: 'https://iptv.55white.xyz:8888',
  version: '1.3.0',
  requiredVersion: '0.0.1',
  detailCacheDuration: 60,
  modules: [
    createIptvModule(),
    {
      id: 'loadResource', // 固定 id：详情页/起播时由客户端调用
      title: '加载播放资源',
      functionName: 'loadResource',
      type: 'stream',
      cacheDuration: 0,
      params: [],
    },
  ],
  search: {
    title: '搜索 IPTV 频道',
    functionName: 'search',
    params: [
      { name: 'keyword', title: '频道名称或分组', type: 'input' },
      { name: 'source', title: 'M3U 地址', type: 'constant', value: DEFAULT_M3U_URL },
    ],
  },
};

function findExtinfSeparator(line) {
  var quoted = false;
  for (var i = 8; i < line.length; i += 1) {
    var char = line[i];
    if (char === '"') quoted = !quoted;
    if (char === ',' && !quoted) return i;
  }
  return -1;
}

function parseExtinf(line) {
  var separator = findExtinfSeparator(line);
  if (separator < 0) return null;

  var attributes = {};
  var attributePattern = /([\w-]+)="([^"]*)"/g;
  var match;
  var metadata = line.slice(8, separator);
  while ((match = attributePattern.exec(metadata)) !== null) {
    attributes[match[1]] = match[2];
  }

  return {
    attributes: attributes,
    name: line.slice(separator + 1).trim(),
  };
}

function parseM3U(text) {
  var channels = [];
  var seenUrls = Object.create(null);
  var current = null;
  var lines = String(text || '').split(/\r?\n/);

  for (var i = 0; i < lines.length; i += 1) {
    var line = lines[i].trim();
    if (!line) continue;

    if (line.indexOf('#EXTINF:') === 0) {
      current = parseExtinf(line);
      if (current) current.headers = {};
      continue;
    }

    if (!current) continue;

    if (line.indexOf('#EXTVLCOPT:http-user-agent=') === 0) {
      current.headers['User-Agent'] = line.slice(27).trim();
      continue;
    }
    if (line.indexOf('#EXTVLCOPT:http-referrer=') === 0) {
      current.headers.Referer = line.slice(25).trim();
      continue;
    }
    if (line[0] === '#') continue;
    if (!/^https?:\/\//i.test(line)) continue;
    if (seenUrls[line]) {
      current = null;
      continue;
    }
    seenUrls[line] = true;

    var attributes = current.attributes;
    channels.push({
      id: attributes['tvg-id'] || line,
      name: current.name || attributes['tvg-name'] || '未命名频道',
      tvgName: attributes['tvg-name'] || '',
      logo: attributes['tvg-logo'] || '',
      group: attributes['group-title'] || deriveGroup(current.name || ''),
      url: line,
      headers: current.headers,
    });
    current = null;
  }

  return channels;
}

// 该源没有 group-title，按频道名推导分组
function deriveGroup(name) {
  var n = String(name || '').trim();
  if (/^CGTN/i.test(n)) return 'CGTN';
  if (/剧场/.test(n)) return '剧场';
  if (/^CCTV/i.test(n) || /^CETV/i.test(n)) return '央视';
  if (/卫视$/.test(n)) return '卫视';
  return '其他';
}

// 台标文件名推导（不含 .png）
function logoName(channel) {
  var slug = String(channel.url || '').match(/\/([a-z0-9-]+)\.m3u8$/i);
  var key = slug ? slug[1].toLowerCase() : '';
  if (LOGO_OVERRIDES[key]) return LOGO_OVERRIDES[key];

  var name = String(channel.name || '');
  var cctv = name.match(/CCTV[-—]?(\d{1,2})(\+)?/i);
  if (cctv) return 'CCTV' + cctv[1] + (cctv[2] ? '+' : '');
  if (/卫视$/.test(name)) return name;
  return name.replace(/\s+/g, '');
}

// M3U 中无 tvg-logo 时按 CCSH/IPTV 规则拼台标地址
function buildLogoSource(channel) {
  if (channel.logo) return channel.logo;
  var path = LOGO_HOST_PATH + '/' + encodeURIComponent(logoName(channel) + '.png');
  return 'https://' + path;
}

function normalizeLogoUrl(url, width, height) {
  if (!url) return '';
  var targetWidth = width || POSTER_W;
  var targetHeight = height || POSTER_H;
  return 'https://images.weserv.nl/?url=' + encodeURIComponent(url) +
    '&w=' + targetWidth + '&h=' + targetHeight +
    '&fit=contain&cbg=00000000&output=png';
}

function toVideoItem(channel) {
  var logoSource = buildLogoSource(channel);
  var poster = normalizeLogoUrl(logoSource, POSTER_W, POSTER_H);
  return {
    id: channel.url,
    type: 'url',
    title: channel.name,
    description: channel.group + ' · IPTV 直播',
    coverUrl: poster,
    posterPath: poster, // 竖图位优先，600x900 等比留白，台标完整显示
    backdropPath: normalizeLogoUrl(logoSource, BACKDROP_W, BACKDROP_H),
    durationText: '直播',
    videoUrl: channel.url,
    link: 'iptv:' + channel.url, // 详情页路由键，由 loadDetail 解析
    playerType: 'app',
    genreTitle: channel.group,
  };
}

async function fetchChannels(params) {
  var source = (params && params.source) || DEFAULT_M3U_URL;
  var response = await Widget.http.get(source);
  var text = typeof response.data === 'string' ? response.data : String(response.data || '');
  if (!text) throw new Error('M3U 响应为空');
  var channels = parseM3U(text);
  if (channels.length === 0) throw new Error('未解析到任何频道');
  return channels;
}

async function loadList(params) {
  params = params || {};
  try {
    var channels = await fetchChannels(params);
    var group = String(params.group || '全部');
    if (group && group !== '全部') {
      channels = channels.filter(function (channel) {
        return channel.group === group;
      });
    }

    var page = Math.max(1, Number(params.page) || 1);
    var count = Math.max(1, Number(params.count) || 100);
    var start = (page - 1) * count;
    return channels.slice(start, start + count).map(toVideoItem);
  } catch (error) {
    console.error('[ysp.rex.live] loadList 失败:', error.message || error);
    throw error;
  }
}

// 严格校验本模块 link 命名空间：仅接受 iptv:http(s)://iptv.55white.xyz:8888/<slug>.m3u8
function parseOwnedLink(link) {
  var raw = String(link == null ? '' : link);
  var match = raw.match(/^iptv:(https?:\/\/iptv\.55white\.xyz:8888\/[a-z0-9-]+\.m3u8)$/i);
  return match ? match[1] : null;
}

// 兼容客户端以裸频道 URL 作为 id 传入（同样做主机名与路径白名单校验）
function parseOwnedUrl(value) {
  var raw = String(value == null ? '' : value);
  var match = raw.match(/^(https?:\/\/iptv\.55white\.xyz:8888\/[a-z0-9-]+\.m3u8)$/i);
  return match ? match[1] : null;
}

// 顶层详情函数：接收 link 字符串（iptv:<频道URL>），归还可播条目
async function loadDetail(link) {
  try {
    var ownedUrl = parseOwnedLink(link);
    if (!ownedUrl) return null; // 非本模块链接，不发起任何请求
    var url = ownedUrl;

    var channels = await fetchChannels({});
    var channel = channels.filter(function (item) {
      return item.url === url;
    })[0];
    if (!channel) {
      console.warn('[ysp.rex.live] loadDetail 未找到频道:', url);
      return null;
    }
    return toVideoItem(channel);
  } catch (error) {
    console.error('[ysp.rex.live] loadDetail 失败:', error.message || error);
    throw error;
  }
}

// 播放资源模块：详情页起播 / 切换线路时调用，返回 VideoResource[]
// params 会自动携带 id / link / videoUrl 等上下文；本站专用，先校验归属再出源
async function loadResource(params) {
  params = params || {};
  try {
    var hasLink = params.link != null && String(params.link) !== '';
    var raw = hasLink ? params.link : params.id;

    // 高优先级 link 已提供但不合法时不得回退 id 兜底
    var url = hasLink ? parseOwnedLink(raw) : parseOwnedUrl(raw);
    if (!url) return []; // 非本站条目，返回空数组且不发请求

    return [
      {
        name: '央视频直播',
        description: 'HLS · m3u8 · 延迟约 20 秒',
        url: url,
        playerType: 'app',
      },
    ];
  } catch (error) {
    console.error('[ysp.rex.live] loadResource 失败:', error.message || error);
    throw error;
  }
}

async function search(params) {
  params = params || {};
  try {
    var keyword = String(params.keyword || params.query || '').trim().toLowerCase();
    if (!keyword) return [];

    var channels = await fetchChannels(params);
    return channels.filter(function (channel) {
      var haystack = [channel.name, channel.tvgName, channel.group, channel.id]
        .join('\n')
        .toLowerCase();
      return haystack.indexOf(keyword) >= 0;
    }).map(toVideoItem);
  } catch (error) {
    console.error('[ysp.rex.live] search 失败:', error.message || error);
    throw error;
  }
}

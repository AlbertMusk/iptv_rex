// 央视频全频道直播 ForwardWidget 模块（基于 iptv.js 的 M3U 解析框架）
// 数据源: https://iptv.55white.xyz:8888/all.m3u
// 说明: 该 M3U 为极简格式，无 tvg-logo / group-title，因此分组与台标按频道名前缀推导
// 台标源: https://raw.githubusercontent.com/CCSH/IPTV/refs/heads/main/logo/{频道名}.png

var DEFAULT_M3U_URL = 'https://iptv.55white.xyz:8888/all.m3u';
var DEBUG = true; // 调试开关：排查完成后改为 false

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
  version: '1.6.1',
  requiredVersion: '0.0.1',
  detailCacheDuration: 0, // 调试期不缓存详情，避免旧结果干扰
  // 直播采用「列表 → loadDetail → 播放器」链路（与可用的 live.js 一致），不声明 loadResource
  modules: [createIptvModule()],
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
// 这里保留原始文件名（含中文/+），由 normalizeLogoUrl 统一编码一次，避免 %2B 被二次编码
function buildLogoSource(channel) {
  if (channel.logo) return channel.logo;
  return 'https://' + LOGO_HOST_PATH + '/' + logoName(channel) + '.png';
}

function normalizeLogoUrl(url, width, height) {
  if (!url) return '';
  var targetWidth = width || POSTER_W;
  var targetHeight = height || POSTER_H;
  return 'https://images.weserv.nl/?url=' + encodeURIComponent(url) +
    '&w=' + targetWidth + '&h=' + targetHeight +
    '&fit=contain&cbg=00000000&output=png';
}

// 列表项字段严格对齐可用的 live.js：id/link 均为直播地址，只保留展示必需字段
function toVideoItem(channel) {
  var logoSource = buildLogoSource(channel);
  var poster = normalizeLogoUrl(logoSource, POSTER_W, POSTER_H);
  return {
    id: channel.url,
    type: 'url',
    title: channel.name,
    description: channel.group + ' · IPTV 直播',
    posterPath: poster, // 竖图位优先，600x900 等比留白，台标完整显示
    backdropPath: normalizeLogoUrl(logoSource, BACKDROP_W, BACKDROP_H),
    previewUrl: '',
    link: channel.url, // 直播地址本身作为详情键
    metadata: {
      group: channel.group,
      tvgName: channel.tvgName || channel.name,
      tvgId: channel.id && channel.id !== channel.url ? channel.id : '',
    },
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
    var items = channels.slice(start, start + count).map(toVideoItem);
    await debugProbe(items);
    return items;
  } catch (error) {
    console.error('[ysp.rex.live] loadList 失败:', error.message || error);
    throw error;
  }
}

// 调试用：统一打印，便于在 rex 日志面板分辨
function dbg(tag, payload) {
  try {
    console.log('[ysp.rex.live][debug] ' + tag + ':', typeof payload === 'string' ? payload : JSON.stringify(payload));
  } catch (e) {
    console.log('[ysp.rex.live][debug] ' + tag + ':', String(payload));
  }
}

// 调试专用：rex 模块调试只能触发 loadList，这里顺带试跑 loadDetail 并打印真实返回值
async function debugProbe(items) {
  if (!DEBUG || !items || items.length === 0) return;
  dbg('模块版本', WidgetMetadata.version + ' / 项数 ' + items.length);
  var sample = items[0];
  dbg('样例列表项', {
    id: sample.id,
    link: sample.link,
    type: sample.type,
    group: sample.metadata && sample.metadata.group,
    keys: Object.keys(sample),
  });
  try {
    var detail = await loadDetail(sample.link);
    dbg('自测 loadDetail 返回值', detail ? {
      id: detail.id,
      type: detail.type,
      videoUrl: detail.videoUrl,
      title: detail.title,
    } : null);
  } catch (error) {
    dbg('自测 loadDetail 抛出', error.message || String(error));
  }
}

// 严格校验频道地址：仅接受 http(s)://iptv.55white.xyz:8888/<slug>.m3u8（可带历史 iptv: 前缀）
function parseChannelUrl(value) {
  var raw = String(value == null ? '' : value);
  var match = raw.match(/^(?:iptv:)?(https?:\/\/iptv\.55white\.xyz:8888\/[a-z0-9-]+\.m3u8)$/i);
  return match ? match[1] : null;
}

// 顶层详情：接收列表项的 link（即直播地址），返回带 videoUrl 的详情条目
async function loadDetail(link) {
  try {
    var rawLink = String(link == null ? '' : link);
    if (DEBUG) dbg('loadDetail 入参', rawLink);

    var url = parseChannelUrl(rawLink);
    if (!url) {
      if (DEBUG) dbg('loadDetail 校验失败(返回 null)', rawLink);
      return null; // 非本模块地址，不发起任何请求
    }

    var channels = await fetchChannels({});
    var channel = channels.filter(function (item) {
      return item.url === url;
    })[0];
    if (!channel) {
      if (DEBUG) dbg('loadDetail 未找到频道(返回 null)', url);
      return null;
    }

    var poster = normalizeLogoUrl(buildLogoSource(channel), POSTER_W, POSTER_H);
    var detailItem = {
      id: url,
      type: 'detail', // 详情条目类型（与 live.js 一致）
      title: channel.name,
      description: channel.group + ' · IPTV 直播',
      posterPath: poster,
      backdropPath: normalizeLogoUrl(buildLogoSource(channel), BACKDROP_W, BACKDROP_H),
      videoUrl: url, // 播放器实际使用的地址
      customHeaders: {
        Referer: url,
        'User-Agent': 'AptvPlayer/1.4.6',
      },
      childItems: [],
    };

    if (DEBUG) {
      dbg('loadDetail 返回', {
        id: detailItem.id,
        type: detailItem.type,
        videoUrl: detailItem.videoUrl,
        title: detailItem.title,
      });
    }
    return detailItem;
  } catch (error) {
    console.error('[ysp.rex.live] loadDetail 失败:', error.message || error);
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

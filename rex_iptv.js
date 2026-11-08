var DEFAULT_M3U_URL = 'https://iptv.55white.xyz:8888/all.m3u';

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
        value: '央视频道',
        enumOptions: [
          { title: '央视频道', value: '央视频道' },
          { title: '卫视频道', value: '卫视频道' },
          { title: '央视精选', value: '央视精选' },
          { title: '广播电台', value: '广播电台' },
        ],
      },
      { name: 'page', title: '页码', type: 'page' },
      { name: 'count', title: '数量', type: 'count', value: '100' },
    ],
  };
}

var WidgetMetadata = {
  id: 'rex.iptv.local',
  title: 'IPTV 直播',
  description: '读取 M3U 播放列表，按分组浏览并直接播放 IPTV 频道',
  author: 'Sanite',
  version: '1.3.3',
  requiredVersion: '0.0.1',
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
      group: attributes['group-title'] || '未分组',
      url: line,
      headers: current.headers,
    });
    current = null;
  }

  return channels;
}

async function fetchChannels(params) {
  var source = (params && params.source) || DEFAULT_M3U_URL;
  var response = await Widget.http.get(source);
  return parseM3U(response.data);
}

function normalizeLogoUrl(url, width, height) {
  if (!url) return '';
  var targetWidth = width || 600;
  var targetHeight = height || 900;
  return 'https://images.weserv.nl/?url=' + encodeURIComponent(url) +
    '&w=' + targetWidth + '&h=' + targetHeight +
    '&fit=contain&cbg=00000000&output=png';
}

function normalizePosterUrl(url) {
  if (!url) return '';
  if (url.indexOf('live.fanmingming.com/tv/') >= 0) {
    var filename = url.split('?')[0].split('/').pop();
    var encoded = encodeURIComponent(filename);
    return 'https://ik.imagekit.io/huangxd/tr:l-image,i-transparent.png,w-800,h-1200,' +
      'bg-00000000,lfo-center,l-image,i-' + encoded +
      ',w-640,lfo-center,l-end,l-end/transparent.png';
  }
  return normalizeLogoUrl(url, 600, 900);
}

function toVideoItem(channel) {
  var posterUrl = normalizePosterUrl(channel.logo);
  return {
    id: channel.url,
    type: 'url',
    title: channel.name,
    description: channel.group + ' · IPTV 直播',
    coverUrl: posterUrl,
    posterPath: posterUrl,
    backdropPath: normalizeLogoUrl(channel.logo, 1200, 500),
    durationText: '直播',
    videoUrl: channel.url,
    playerType: 'app',
    genreTitle: channel.group,
  };
}

async function loadList(params) {
  params = params || {};
  var channels = await fetchChannels(params);
  var group = String(params.group || '');
  if (group) {
    channels = channels.filter(function (channel) {
      return channel.group === group;
    });
  }

  var page = Math.max(1, Number(params.page) || 1);
  var count = Math.max(1, Number(params.count) || 100);
  var start = (page - 1) * count;
  return channels.slice(start, start + count).map(toVideoItem);
}

async function search(params) {
  params = params || {};
  var keyword = String(params.keyword || params.query || '').trim().toLowerCase();
  if (!keyword) return [];

  var channels = await fetchChannels(params);
  return channels.filter(function (channel) {
    var haystack = [channel.name, channel.tvgName, channel.group, channel.id]
      .join('\n')
      .toLowerCase();
    return haystack.indexOf(keyword) >= 0;
  }).map(toVideoItem);
}

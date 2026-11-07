/**
 * Forward IPTV Widget
 * Version: 1.3.0
 *
 * 功能：
 * 1. 远程 M3U 频道源
 * 2. 频道分组筛选
 * 3. 频道搜索
 * 4. 首页精选频道
 * 5. 频道详情
 * 6. 直播资源加载
 */

var WidgetMetadata = {
  id: "forward.iptv",
  title: "IPTV 电视直播",
  description: "从远程 M3U 地址读取频道，按分组浏览并播放电视直播。",
  author: "Custom",
  site: "https://github.com/InchStudio/ForwardWidgets",
  version: "1.3.0",
  requiredVersion: "0.0.1",
  detailCacheDuration: 0,

  modules: [
    {
      id: "loadList",
      title: "电视频道",
      description: "按分组或关键词筛选 IPTV 频道",
      functionName: "loadList",
      cacheDuration: 0,
      params: [
        {
          name: "group",
          title: "频道分组",
          type: "input",
          description: "可填写远程 M3U 中的 group-title；留空显示全部频道",
          value: ""
        },
        {
          name: "keyword",
          title: "频道关键词",
          type: "input",
          description: "可输入 CCTV5、山东卫视、济南等关键词",
          value: ""
        }
      ]
    },
    {
      id: "home",
      title: "首页直播",
      description: "在 Forward 首页添加此模块，显示精选常用频道",
      functionName: "loadHome",
      cacheDuration: 0,
      params: []
    }
  ],

  search: {
    title: "搜索电视频道",
    functionName: "searchChannels",
    params: [
      {
        name: "keyword",
        title: "频道名称",
        type: "input",
        description: "输入频道名称或关键词"
      }
    ]
  }
};

// =====================================================
// 1. IPTV 配置
// =====================================================

var IPTV_PLAYLIST_URL =
  "https://raw.githubusercontent.com/AlbertMusk/iptv_rex/refs/heads/main/list.m3u";

// 缓存时间：5 分钟
var IPTV_CACHE_TTL = 5 * 60 * 1000;

// 全局缓存
var IPTV_CHANNELS = [];
var IPTV_LAST_FETCHED_AT = 0;
var IPTV_FETCHING = null;


// =====================================================
// 2. M3U 解析
// =====================================================

function parseM3U(text) {
  var lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);

  var channels = [];
  var current = null;

  function parseAttributes(line) {
    var attrs = {};
    var re = /([\w-]+)="([^"]*)"/g;
    var match;

    while ((match = re.exec(line)) !== null) {
      attrs[match[1]] = match[2];
    }

    return attrs;
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();

    if (!line) continue;

    // 解析频道信息
    if (line.indexOf("#EXTINF:") === 0) {
      var comma = line.indexOf(",");

      var head = comma >= 0
        ? line.slice(0, comma)
        : line;

      var displayName = comma >= 0
        ? line.slice(comma + 1).trim()
        : "";

      var attrs = parseAttributes(head);

      current = {
        name:
          displayName ||
          attrs["tvg-name"] ||
          "未命名频道",

        tvgName: attrs["tvg-name"] || "",

        logo: attrs["tvg-logo"] || "",

        group: attrs["group-title"] || "未分类",

        resolution: attrs["resolution"] || "",

        catchup: attrs["catchup"] || "",

        catchupSource: attrs["catchup-source"] || "",

        catchupDays: attrs["catchup-days"] || "",

        tvgId: attrs["tvg-id"] || ""
      };

      continue;
    }

    // 跳过其他 M3U 标签
    if (line.charAt(0) === "#") continue;

    // 解析直播地址
    if (/^(https?|rtsp):\/\//i.test(line)) {
      var item = current || {
        name: line,
        tvgName: "",
        logo: "",
        group: "未分类",
        resolution: ""
      };

      item.url = line;

      channels.push(item);

      current = null;
    }
  }

  return channels;
}


// =====================================================
// 3. 获取远程 M3U
// =====================================================

async function ensureChannels(forceRefresh) {
  var now = Date.now();

  // 缓存有效
  if (
    !forceRefresh &&
    IPTV_CHANNELS.length &&
    now - IPTV_LAST_FETCHED_AT < IPTV_CACHE_TTL
  ) {
    return IPTV_CHANNELS;
  }

  // 防止重复请求
  if (IPTV_FETCHING) {
    return IPTV_FETCHING;
  }

  IPTV_FETCHING = (async function () {
    try {
      var response = await Widget.http.get(
        IPTV_PLAYLIST_URL,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; ForwardIPTV/1.0)"
          }
        }
      );

      var playlistText = response && response.data;

      if (typeof playlistText !== "string") {
        throw new Error("远程 M3U 返回内容不是文本");
      }

      var parsed = parseM3U(playlistText);

      if (!parsed.length) {
        throw new Error(
          "远程 M3U 中没有解析到有效频道，请检查播放列表格式"
        );
      }

      IPTV_CHANNELS = parsed;
      IPTV_LAST_FETCHED_AT = Date.now();

      console.log(
        "IPTV 播放列表加载成功，共 " +
        IPTV_CHANNELS.length +
        " 个频道"
      );

      return IPTV_CHANNELS;

    } catch (error) {
      console.error(
        "IPTV 播放列表获取失败:",
        error
      );

      // 网络异常时使用旧缓存
      if (IPTV_CHANNELS.length) {
        return IPTV_CHANNELS;
      }

      throw new Error(
        "获取 IPTV 播放列表失败：" +
        (error && error.message ? error.message : error)
      );

    } finally {
      IPTV_FETCHING = null;
    }
  })();

  return IPTV_FETCHING;
}


// =====================================================
// 4. 文本处理
// =====================================================

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "");
}


// =====================================================
// 5. 转换为 Forward VideoItem
// =====================================================

function channelToVideo(channel) {
  var detail = [];

  if (channel.group) {
    detail.push("分组：" + channel.group);
  }

  if (channel.resolution) {
    detail.push("分辨率：" + channel.resolution);
  }

  if (channel.tvgName) {
    detail.push("频道标识：" + channel.tvgName);
  }

  if (channel.catchupDays) {
    detail.push("回看天数：" + channel.catchupDays);
  }

  return {
    id: channel.url,

    type: "url",

    title: channel.name,

    link: channel.url,

    coverUrl: channel.logo || "",

    posterPath: channel.logo || "",

    description: detail.join(" | "),

    mediaType: "tv",

    genreItems: [
      {
        id: channel.group,
        title: channel.group
      }
    ]
  };
}


// =====================================================
// 6. 频道筛选
// =====================================================

function filterChannels(params, sourceChannels) {
  params = params || {};

  var group = String(
    params.group || params.genreId || ""
  ).trim();

  var keyword = normalizeText(
    params.keyword ||
    params.query ||
    params.q ||
    ""
  );

  return (sourceChannels || IPTV_CHANNELS).filter(
    function (channel) {

      // 分组筛选
      if (group && channel.group !== group) {
        return false;
      }

      // 没有关键词
      if (!keyword) {
        return true;
      }

      var haystack = normalizeText([
        channel.name,
        channel.tvgName,
        channel.group,
        channel.resolution
      ].join(" "));

      return haystack.indexOf(keyword) >= 0;
    }
  );
}


// =====================================================
// 7. 频道列表模块
// =====================================================

async function loadList(params) {
  var sourceChannels = await ensureChannels(false);

  var channels = filterChannels(
    params,
    sourceChannels
  );

  return channels.map(channelToVideo);
}


// =====================================================
// 8. 首页精选频道
// =====================================================

async function loadHome(params) {
  var sourceChannels = await ensureChannels(false);

  var priorities = [
    "CCTV-4K",
    "CCTV1综合",
    "CCTV5体育",
    "CCTV13新闻",
    "CCTV6电影",
    "山东卫视4K",
    "山东卫视",
    "北京卫视",
    "湖南卫视",
    "东方卫视",
    "浙江卫视",
    "江苏卫视"
  ];

  var selected = [];
  var used = {};

  // 优先匹配常用频道
  priorities.forEach(function (keyword) {
    var target = normalizeText(keyword);

    var match = sourceChannels.find(
      function (channel) {

        var key = normalizeText(
          channel.name + " " + channel.tvgName
        );

        return (
          key.indexOf(target) >= 0 &&
          !used[channel.url]
        );
      }
    );

    if (match) {
      selected.push(match);
      used[match.url] = true;
    }
  });

  // 不足 12 个时自动补齐
  for (
    var i = 0;
    i < sourceChannels.length && selected.length < 12;
    i++
  ) {
    var channel = sourceChannels[i];

    if (!used[channel.url]) {
      selected.push(channel);
      used[channel.url] = true;
    }
  }

  return selected.map(channelToVideo);
}


// =====================================================
// 9. 搜索频道
// =====================================================

async function searchChannels(params) {
  var keyword = params && (
    params.keyword ||
    params.query ||
    params.q
  );

  if (!keyword) {
    return [];
  }

  var sourceChannels = await ensureChannels(false);

  return filterChannels(
    {
      keyword: keyword
    },
    sourceChannels
  ).map(channelToVideo);
}


// =====================================================
// 10. 频道详情
// =====================================================

async function loadDetail(link) {

  // 兼容字符串和对象参数
  var url = "";

  if (typeof link === "string") {
    url = link.trim();

  } else if (link && typeof link === "object") {
    url = String(
      link.link ||
      link.url ||
      link.videoUrl ||
      link.id ||
      ""
    ).trim();
  }

  if (!/^(https?|rtsp):\/\//i.test(url)) {
    return null;
  }

  var channel = IPTV_CHANNELS.find(
    function (item) {
      return item.url === url;
    }
  );

  // 找到缓存中的频道
  if (channel) {
    return channelToVideo(channel);
  }

  // 即使没有缓存，也可以根据 URL 返回详情
  return {
    id: url,

    type: "url",

    title: "IPTV 直播",

    link: url,

    mediaType: "tv"
  };
}


// =====================================================
// 11. 提取播放地址
// =====================================================

function extractResourceUrl(params) {

  // 客户端直接传入字符串
  if (typeof params === "string") {
    var direct = params.trim();

    return /^(https?|rtsp):\/\//i.test(direct)
      ? direct
      : "";
  }

  params = params || {};

  var candidates = [
    params.link,
    params.videoUrl,
    params.url,
    params.id,
    params.sourceUrl
  ];

  for (var i = 0; i < candidates.length; i++) {

    var value = String(
      candidates[i] || ""
    ).trim();

    if (/^(https?|rtsp):\/\//i.test(value)) {
      return value;
    }
  }

  return "";
}


// =====================================================
// 12. 加载播放资源
// =====================================================

async function loadResource(params) {
  params = params || {};

  // 优先从客户端参数提取 URL
  var url = extractResourceUrl(params);

  var channel = null;

  if (url) {

    channel = IPTV_CHANNELS.find(
      function (item) {
        return item.url === url;
      }
    ) || null;

  } else {

    // 兼容客户端只传 ID 或频道名称
    var sourceChannels = await ensureChannels(false);

    var id = String(params.id || "");

    var title = String(
      params.title ||
      params.name ||
      ""
    );

    channel = sourceChannels.find(
      function (item) {
        return (
          item.url === id ||
          item.name === title ||
          item.tvgName === title
        );
      }
    ) || null;

    url = channel ? channel.url : "";
  }

  // 没有播放地址
  if (!url) {

    console.error(
      "IPTV loadResource 未取得播放地址，params:",
      JSON.stringify(params)
    );

    throw new Error(
      "未取得频道播放地址。请检查客户端是否向 loadResource 传递 link 或 id。"
    );
  }

  // 返回 Forward VideoResource[]
  return [
    {
      name:
        channel && channel.name
          ? channel.name
          : "直播线路",

      description: channel
        ? (
            (channel.resolution
              ? channel.resolution + " · "
              : "") +
            (channel.group || "IPTV")
          )
        : "IPTV 直播",

      url: url,

      playerType: "app"
    }
  ];
}

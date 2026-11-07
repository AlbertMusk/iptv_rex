/**
 * Forward IPTV Widget
 * Playlist source: remote M3U URL.
 * Fetches the latest playlist, parses EXTINF metadata,
 * filters channels and plays HLS/RTSP streams.
 */

var WidgetMetadata = {
  id: "forward.iptv",
  title: "IPTV 电视直播",
  description: "从远程 M3U 地址读取频道，按分组浏览并播放电视直播。",
  author: "Custom",
  site: "https://github.com/InchStudio/ForwardWidgets",
  version: "1.1.0",
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
          description: "可输入 CCTV5、山东卫视等关键词",
          value: ""
        }
      ]
    },
    {
      id: "loadResource",
      title: "播放直播",
      functionName: "loadResource",
      type: "stream",
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


// ========================================
// 1. IPTV 配置
// ========================================

// 远程 IPTV 播放列表
var IPTV_PLAYLIST_URL =
  "https://iptv.55white.xyz:8888/all.m3u";

// 内存缓存 5 分钟
var IPTV_CACHE_TTL = 5 * 60 * 1000;

// 当前频道数据
var IPTV_CHANNELS = [];

// 上次成功获取时间
var IPTV_LAST_FETCHED_AT = 0;

// 正在进行的请求
var IPTV_FETCHING = null;


// ========================================
// 2. M3U 解析
// ========================================

function parseM3U(text) {
  var lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);

  var channels = [];
  var current = null;

  // 解析 EXTINF 属性
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
        name: displayName || attrs["tvg-name"] || "未命名频道",

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

    // 跳过注释
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


// ========================================
// 3. 获取远程 IPTV 数据
// ========================================

async function ensureChannels(forceRefresh) {
  var now = Date.now();

  // 缓存有效，直接返回
  if (
    !forceRefresh &&
    IPTV_CHANNELS.length &&
    now - IPTV_LAST_FETCHED_AT < IPTV_CACHE_TTL
  ) {
    return IPTV_CHANNELS;
  }

  // 避免并发重复请求
  if (IPTV_FETCHING) {
    return IPTV_FETCHING;
  }

  IPTV_FETCHING = (async function () {
    try {
      console.log("开始获取 IPTV 播放列表...");

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

      // 解析 M3U
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

      // 网络临时故障时使用旧缓存
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


// ========================================
// 4. 字符串处理
// ========================================

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "");
}


// ========================================
// 5. 频道数据转换
// ========================================

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

    videoUrl: channel.url,

    coverUrl: channel.logo || "",

    posterPath: channel.logo || "",

    description: detail.join(" | "),

    genreTitle: channel.group,

    genreItems: [
      {
        id: channel.group,
        title: channel.group
      }
    ],

    playerType: "app"
  };
}


// ========================================
// 6. 频道筛选
// ========================================

function filterChannels(params, sourceChannels) {
  params = params || {};

  var group = String(
    params.group ||
    params.genreId ||
    ""
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

      // 没有关键词，直接返回
      if (!keyword) {
        return true;
      }

      // 关键词匹配
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


// ========================================
// 7. 加载频道列表
// ========================================

async function loadList(params) {

  // 获取远程频道
  var sourceChannels = await ensureChannels(false);

  // 筛选频道
  var channels = filterChannels(
    params,
    sourceChannels
  );

  // 转换成 Forward 数据格式
  return channels.map(channelToVideo);
}


// ========================================
// 8. 搜索频道
// ========================================

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


// ========================================
// 9. 加载频道详情
// ========================================

async function loadDetail(link) {

  var sourceChannels = await ensureChannels(false);

  var url = String(link || "");

  var channel = sourceChannels.find(
    function (item) {
      return item.url === url;
    }
  );

  if (!channel) {

    if (!/^(https?|rtsp):\/\//i.test(url)) {
      return null;
    }

    return {
      id: url,
      type: "url",
      title: "IPTV 直播",
      link: url,
      videoUrl: url,
      playerType: "app"
    };
  }

  return channelToVideo(channel);
}


// ========================================
// 10. 加载播放资源
// ========================================

async function loadResource(params) {

  var sourceChannels = await ensureChannels(false);

  params = params || {};

  var url = String(
    params.link ||
    params.videoUrl ||
    params.id ||
    ""
  );

  // 兼容不同 Forward 版本传递参数的差异
  if (!/^(https?|rtsp):\/\//i.test(url)) {

    var found = sourceChannels.find(
      function (item) {
        return (
          item.name === params.title ||
          item.tvgName === params.title
        );
      }
    );

    if (found) {
      url = found.url;
    }
  }

  if (!/^(https?|rtsp):\/\//i.test(url)) {
    throw new Error(
      "无法取得直播地址，请重新打开频道后播放"
    );
  }

  var channel = sourceChannels.find(
    function (item) {
      return item.url === url;
    }
  );

  return [
    {
      name: "直播线路",

      description: channel
        ? (
            (channel.resolution
              ? channel.resolution + " · "
              : "") +
            (channel.group || "IPTV")
          )
        : "IPTV",

      url: url,

      playerType: "app"
    }
  ];
}

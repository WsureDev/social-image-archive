# 图片档案 MCP

本地图库同时提供只读 MCP，使用官方 SDK 的无状态 Streamable HTTP，地址：

```text
http://192.0.2.10:19280/mcp
```

客户端配置 URL 与 Header（外层配置格式按客户端填写）：

```json
{
  "url": "http://192.0.2.10:19280/mcp",
  "headers": {
    "X-Archive-Max-Pick": "3"
  }
}
```

不需要本地访问令牌。这里只查询已下载的本地档案，不消耗 Cloudflare 队列操作。所有工具只返回文本元数据和按当前访问 Host 生成的原图 HTTP 下载 URL，调用方直接下载原图。

## 数量与地址

- `X-Archive-Max-Pick` 是每次挑选数量上限，必须为十进制正整数。
- 不传 Header 时使用 `MCP_MAX_PICK`，本机默认 3；Header 可以覆盖默认值。
- 不传 `count` 时按当前 `maxPick` 取图；显式 `count` 超限会在查询前自动截断，不报数量超限错误。
- 结果包含 `maxPick` 和实际 `returned`。没有足够匹配图片时，返回实际数量，不放宽筛选条件。
- 游标不保存地址或数量上限。继续取图时，使用本次请求的 Host 和 Header；不同客户端独立。
- 这是每次挑选数量，不是累计配额。图片内容不会被工具自动发送到社交软件。

图片 HTTP 地址沿用调用 MCP 时的协议、Host 和端口，支持 IPv4、IPv6、域名、`host.docker.internal` 和内部服务名。普通内部服务名不能仅凭名字判断是否属于 Docker。

若部署反向代理，设置 `MCP_TRUST_PROXY=true` 后支持 `Forwarded` 或 `X-Forwarded-Host` / `X-Forwarded-Proto`；默认不采用转发头。修改 `.env` 后执行 `docker compose up -d` 应用。

当前 Compose 使用 host 网络；通过 Docker 服务名访问需要自行配置对应网络或名称映射。

## 工具

### list_image_facets

发现实际存在的标签、作者和平台，并返回对应图片数量。

```json
{ "dimension": "all", "limit": 20 }
```

`dimension` 支持 `all`、`tags`、`authors`、`platforms`。`query` 可搜索候选值；`limit` 默认 20、最大 100，限制的是候选值数量，与图片上限无关。

返回的各项包含 `value`、`label`、`count`；作者 `value` 是 ID，`label` 是名称。

### pick_images

```json
{
  "filters": {
    "tags": {
      "all": ["白毛"],
      "any": ["水手服", "JK"],
      "not": ["AI"]
    },
    "platforms": ["twitter"],
    "publishedFrom": "2026-10-01T00:00:00+08:00"
  },
  "count": 8,
  "order": "random",
  "excludeIds": []
}
```

Header 为 3 时，上例最多返回 3 张。

- `filters.query` 搜索作者、标签、平台等元数据，不是图像语义搜索。
- `author` 精确匹配作者 ID 或名称；`platforms` 匹配其中任一平台。
- `tags.all` 要求全部包含；`tags.any` 要求至少一个；`tags.not` 排除这些标签。
- `publishedFrom` / `publishedTo` 为含时区的发布时间范围。
- `order` 为 `random`（默认）、`newest` 或 `oldest`。
- `excludeIds` 排除已经展示或发送过的图片。
- 工具只返回结构化元数据和原图 HTTP 下载地址，调用方根据 `originalUrl` 下载原始图片。

返回 `maxPick`、`matchedTotal`、`returned`、`nextCursor` 和 `items`。每项包含 ID、作者、平台、标签、时间、尺寸、大小、SHA-256、原帖链接、按当前 Host 生成的 `originalUrl` 原图下载地址。

继续取图：

```json
{ "cursor": "上次返回的 nextCursor" }
```

游标固定筛选、顺序、随机种子、入档时间范围和位置，连续取图不重新洗牌。传入游标时沿用其中的筛选、排序和排除列表；可以修改 `count`，但仍按当前 Header 自动截断。

### 直接下载原图

`pick_images` 已返回完整元数据及 `items[].originalUrl`。LLM 拿到结果后，直接使用下载工具或 HTTP 客户端对该 URL 发起 GET 请求即可；链接指向已归档原图，保留原始分辨率和格式。

例如，把返回的 URL 原样传给下载工具，或运行：

```bash
curl -fL 'pick_images 返回的 originalUrl' -o image.jpg
```

`GET /mcp` 返回 405 是正常行为；该端点使用 POST，不提供旧版独立 SSE 入口。健康检查仍为 `GET /health`。

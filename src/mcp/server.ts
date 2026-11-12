import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Archive } from '../local/archive'
import { FacetQuerySchema } from '../local/catalog-filters'
import type { RequestPolicy } from './policy'
import { PickInputSchema, prepareSelection, encodeCursor } from './selection'
import { FacetResultSchema, PickResultSchema, toolResponse, toolError } from './responses'
import { createMcpImages, type ImageSizeReader } from './images'

const ReadOnlyAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false }

export function createArchiveMcp(archive: Archive, readSize: ImageSizeReader, directory: string, policy: RequestPolicy) {
  const server = new McpServer({ name: 'image-archive', version: '1.0.1' }, {
    instructions: '从本地已归档图片中发现标签、挑图和获取原图下载地址。query 搜索元数据，不进行图像语义搜索。' +
      'pick_images 返回的 items[].originalUrl 可直接下载原图；拿到链接后，使用下载工具或 HTTP 客户端发起 GET 请求即可。' +
      '当前入口为 ' + policy.origin + '（' + policy.hostKind + '），每次最多挑选 ' + policy.maxPick + ' 张；超过上限自动截断，结果中 maxPick 为实际配置。'
  })
  const images = createMcpImages(archive, readSize, directory, policy)

  server.registerTool('list_image_facets', {
    title: '查看图片标签、作者和平台',
    description: '发现图库中实际存在的标签、作者和平台及对应图片数量。按 query 搜索候选值；limit 是候选值数量，不是挑图数量。',
    inputSchema: FacetQuerySchema,
    outputSchema: FacetResultSchema,
    annotations: { ...ReadOnlyAnnotations, idempotentHint: true }
  }, function (input) {
    return toolResponse({ maxPick: policy.maxPick, ...archive.facetValues(input) })
  })

  server.registerTool('pick_images', {
    title: '按条件挑选图片',
    description: '从已下载的本地档案按标签、作者、平台和时间挑图。默认随机，标签 all/any/not 分别表示全部、任一、排除。' +
      'count 省略时取 maxPick，超过 Header 上限会自动截断，不报数量超限错误。返回 nextCursor 可继续不重复挑图；续取沿用原筛选顺序，但重新按本次 Header 截断。' +
      '只返回元数据和按当前访问 Host 生成的原图 HTTP 下载 URL。拿到结果后，直接使用下载工具或 HTTP 客户端对 items[].originalUrl 发起 HTTP GET 下载原图。没有匹配时返回空结果，不自动放宽条件。',
    inputSchema: PickInputSchema,
    outputSchema: PickResultSchema,
    annotations: { ...ReadOnlyAnnotations, idempotentHint: false }
  }, async function (input) {
    let prepared: ReturnType<typeof prepareSelection>
    try {
      prepared = prepareSelection(input, policy.maxPick)
    } catch {
      return toolError('INVALID_CURSOR: 游标无效，请省略 cursor 后重新挑图')
    }
    const result = archive.pick(prepared.query)
    const selected = await Promise.all(result.images.map(function (row) { return images.item(row.id) }))
    const items = selected.filter(function (image) { return image !== null })
    const nextOffset = result.offset + result.images.length
    let nextCursor: string | null = null
    if (nextOffset < result.total && result.images.length > 0) {
      nextCursor = encodeCursor(prepared.selection, nextOffset)
    }
    return toolResponse({ maxPick: policy.maxPick, matchedTotal: result.total, returned: items.length, nextCursor, items })
  })

  return server
}

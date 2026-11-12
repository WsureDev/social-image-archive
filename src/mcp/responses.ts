import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { ImageMessageSchema } from '../message'
import { FacetValuesSchema } from '../local/catalog-filters'

export const ImageItemSchema = z.object({
  id: z.string(),
  author: ImageMessageSchema.shape.author,
  platform: z.string(),
  tags: z.array(z.string()),
  publishedAt: z.string(),
  archivedAt: z.string(),
  width: z.number(),
  height: z.number(),
  bytes: z.number(),
  sha256: z.string(),
  mimeType: z.string(),
  originalUrl: z.url().describe('可直接 HTTP GET 下载原图的绝对 URL，协议、Host 和端口与本次 MCP 访问入口一致'),
  postUrl: z.url().optional()
})
export const PickResultSchema = z.object({
  maxPick: z.number(),
  matchedTotal: z.number(),
  returned: z.number(),
  nextCursor: z.string().nullable(),
  items: z.array(ImageItemSchema)
})
export const FacetResultSchema = FacetValuesSchema.extend({ maxPick: z.number() })

export function toolResponse(data: z.infer<typeof PickResultSchema> | z.infer<typeof FacetResultSchema>): CallToolResult {
  return {
    structuredContent: data,
    content: [{ type: 'text', text: JSON.stringify(data) }]
  }
}

export function toolError(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] }
}

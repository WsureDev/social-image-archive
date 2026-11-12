import { z } from 'zod'
import { ImageIdSchema, TagFilterSchema } from '../local/catalog-filters'
import { pickCount } from './policy'

export const ImageFiltersSchema = z.object({
  query: z.string().trim().max(200).optional(),
  tags: TagFilterSchema.default({ all: [], any: [], not: [] }),
  platforms: z.array(z.string().min(1).max(80)).max(100).default([]),
  author: z.string().min(1).max(200).optional(),
  publishedFrom: z.iso.datetime({ offset: true }).optional(),
  publishedTo: z.iso.datetime({ offset: true }).optional()
})
export const PickInputSchema = z.object({
  filters: ImageFiltersSchema.optional(),
  count: z.number().int().positive().safe().optional().describe('希望挑选的数量；省略则取 Header 配置的 maxPick，超过上限会自动截断'),
  order: z.enum(['random', 'newest', 'oldest']).optional(),
  excludeIds: z.array(ImageIdSchema).max(2000).optional(),
  cursor: z.string().max(512000).optional().describe('继续上次选择；沿用游标中的筛选和顺序，count 仍受当前 Header 上限约束')
})
const SelectionSchema = z.object({
  version: z.literal(1),
  filters: ImageFiltersSchema,
  order: z.enum(['random', 'newest', 'oldest']),
  excludeIds: z.array(ImageIdSchema).max(2000),
  seed: z.number().int().min(0).max(4294967295),
  snapshot: z.iso.datetime(),
  offset: z.number().int().nonnegative().safe()
})

export function encodeCursor(selection: z.infer<typeof SelectionSchema>, offset: number) {
  return Buffer.from(JSON.stringify({ ...selection, offset })).toString('base64url')
}

export function prepareSelection(input: z.infer<typeof PickInputSchema>, maxPick: number) {
  let selection: z.infer<typeof SelectionSchema>
  if (input.cursor) {
    selection = SelectionSchema.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')))
  } else {
    let order: 'random' | 'newest' | 'oldest' = 'random'
    if (input.order) {
      order = input.order
    }
    selection = {
      version: 1,
      filters: input.filters || ImageFiltersSchema.parse({}),
      order,
      excludeIds: input.excludeIds || [],
      seed: crypto.getRandomValues(new Uint32Array(1))[0],
      snapshot: new Date().toISOString(),
      offset: 0
    }
  }
  const filters = selection.filters
  const count = pickCount(input.count, maxPick)
  const query = {
    q: filters.query,
    platform: undefined,
    platforms: filters.platforms,
    author: filters.author,
    tag: undefined,
    tags: filters.tags,
    excludeIds: selection.excludeIds,
    from: filters.publishedFrom,
    to: filters.publishedTo,
    until: selection.snapshot,
    limit: count,
    offset: selection.offset,
    order: selection.order,
    seed: selection.seed
  }
  return { selection, query }
}

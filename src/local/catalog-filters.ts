import { z } from 'zod'

export const ImageIdSchema = z.string().regex(/^[a-f0-9]{64}$/)
const TagSchema = z.string().trim().min(1).max(120)
export const TagFilterSchema = z.object({
  all: z.array(TagSchema).max(100).default([]),
  any: z.array(TagSchema).max(100).default([]),
  not: z.array(TagSchema).max(100).default([])
})
export const PickSchema = z.object({
  q: z.string().trim().max(200).optional(),
  platform: z.string().optional(),
  platforms: z.array(z.string().min(1).max(80)).max(100).default([]),
  author: z.string().optional(),
  tag: z.string().optional(),
  tags: TagFilterSchema.default({ all: [], any: [], not: [] }),
  excludeIds: z.array(ImageIdSchema).max(2000).default([]),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  until: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(24),
  offset: z.coerce.number().int().nonnegative().default(0),
  order: z.enum(['newest', 'oldest', 'random']).default('newest'),
  seed: z.coerce.number().int().min(0).max(4294967295).default(0)
})
export const FacetQuerySchema = z.object({
  dimension: z.enum(['tags', 'authors', 'platforms', 'all']).default('all'),
  query: z.string().trim().max(200).default(''),
  limit: z.number().int().min(1).max(100).default(20)
})
export const FacetValueSchema = z.object({ value: z.string(), label: z.string(), count: z.number() })
export const FacetValuesSchema = z.object({
  tags: z.array(FacetValueSchema),
  authors: z.array(FacetValueSchema),
  platforms: z.array(FacetValueSchema)
})

export function likePattern(value: string) {
  return '%' + value.replace(/[\\%_]/g, function (character) { return '\\' + character }) + '%'
}

export function conditions(input: z.infer<typeof PickSchema>) {
  const clauses: string[] = []
  const parameters: (string | number)[] = []
  if (input.q) {
    const pattern = likePattern(input.q)
    clauses.push(`(author_name LIKE ? ESCAPE '\\' OR author_id LIKE ? ESCAPE '\\' OR platform LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM image_tags WHERE image_id = images.id AND tag LIKE ? ESCAPE '\\'))`)
    parameters.push(pattern, pattern, pattern, pattern)
  }
  if (input.platform) {
    clauses.push('platform = ?')
    parameters.push(input.platform)
  }
  if (input.platforms.length > 0) {
    clauses.push('platform IN (' + input.platforms.map(function () { return '?' }).join(',') + ')')
    parameters.push(...input.platforms)
  }
  if (input.author) {
    clauses.push('(author_id = ? OR author_name = ?)')
    parameters.push(input.author, input.author)
  }
  const requiredTags = [...input.tags.all]
  if (input.tag) {
    requiredTags.push(input.tag)
  }
  for (const tag of requiredTags) {
    clauses.push('EXISTS (SELECT 1 FROM image_tags WHERE image_id = images.id AND tag = ?)')
    parameters.push(tag)
  }
  for (const [kind, tags] of [['any', input.tags.any], ['not', input.tags.not]] as const) {
    if (tags.length === 0) {
      continue
    }
    let prefix = 'EXISTS'
    if (kind === 'not') {
      prefix = 'NOT EXISTS'
    }
    clauses.push(prefix + ' (SELECT 1 FROM image_tags WHERE image_id = images.id AND tag IN (' + tags.map(function () { return '?' }).join(',') + '))')
    parameters.push(...tags)
  }
  if (input.excludeIds.length > 0) {
    clauses.push('id NOT IN (' + input.excludeIds.map(function () { return '?' }).join(',') + ')')
    parameters.push(...input.excludeIds)
  }
  for (const [column, operation, value] of [
    ['published_at', '>=', input.from], ['published_at', '<=', input.to], ['archived_at', '<=', input.until]
  ] as const) {
    if (value) {
      clauses.push(column + ' ' + operation + ' ?')
      parameters.push(new Date(value).toISOString())
    }
  }
  let where = ''
  if (clauses.length > 0) {
    where = 'WHERE ' + clauses.join(' AND ')
  }
  return { where, parameters }
}

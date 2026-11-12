import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import { ImageMessageSchema } from '../message'
import { PickSchema, FacetQuerySchema, FacetValueSchema, FacetValuesSchema, conditions, likePattern } from './catalog-filters'
export { PickSchema } from './catalog-filters'

export const StoredImageSchema = z.object({
  id: z.string(),
  payload: z.string().transform(function (value) {
    return ImageMessageSchema.parse(JSON.parse(value))
  }),
  filename: z.string(),
  sha256: z.string(),
  bytes: z.number(),
  archived_at: z.string()
})

const CountSchema = z.object({ count: z.number() })
const PlatformSchema = z.object({ platform: z.string() })
const TagSchema = z.object({ tag: z.string() })
const AuthorSchema = z.object({ id: z.string(), name: z.string() })

export function createCatalog(db: Database) {
  db.function('pick_rank', { deterministic: true }, function (id: string, seed: number) {
    const value = id + ':' + seed
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) {
      hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
    }
    return hash >>> 0
  })

  function pick(input: z.infer<typeof PickSchema>) {
    const { where, parameters } = conditions(input)
    const { count: total } = CountSchema.parse(db.query(`SELECT COUNT(*) AS count FROM images ${where}`).get(...parameters))
    const values = [...parameters]
    let order = 'published_at DESC, id DESC'
    if (input.order === 'oldest') {
      order = 'published_at ASC, id ASC'
    }
    if (input.order === 'random') {
      order = 'pick_rank(id, ?) ASC, id ASC'
      values.push(input.seed)
    }
    const rows = db.query(`SELECT * FROM images ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...values, input.limit, input.offset)
    const images = z.array(StoredImageSchema).parse(rows).map(function (row) {
      return { ...row, image: '/objects/' + row.filename, thumbnail: '/thumbnails/' + row.filename }
    })
    return { images, total, limit: input.limit, offset: input.offset }
  }

  function facets() {
    const platforms = z.array(PlatformSchema).parse(db.query('SELECT DISTINCT platform FROM images ORDER BY platform').all())
    const tags = z.array(TagSchema).parse(db.query('SELECT DISTINCT tag FROM image_tags ORDER BY tag LIMIT 500').all())
    const authors = z.array(AuthorSchema).parse(db.query('SELECT DISTINCT author_id AS id, author_name AS name FROM images ORDER BY author_name LIMIT 500').all())
    const rawRange = z.object({ date_from: z.string().nullable(), date_to: z.string().nullable() }).parse(db.query(
      'SELECT MIN(published_at) AS date_from, MAX(published_at) AS date_to FROM images'
    ).get())
    return {
      platforms: platforms.map(function (row) { return row.platform }),
      tags: tags.map(function (row) { return row.tag }),
      authors,
      dateRange: { from: rawRange.date_from, to: rawRange.date_to }
    }
  }

  const deleteTransaction = db.transaction(function (ids: string[]) {
    const placeholders = ids.map(function () { return '?' }).join(',')
    const rows = z.array(z.object({ id: z.string(), filename: z.string() })).parse(db.query(
      'SELECT id, filename FROM images WHERE id IN (' + placeholders + ')'
    ).all(...ids))
    db.query('DELETE FROM image_tags WHERE image_id IN (' + placeholders + ')').run(...ids)
    db.query('DELETE FROM images WHERE id IN (' + placeholders + ')').run(...ids)
    return rows
  })

  function deleteImages(ids: string[]) {
    if (ids.length === 0) {
      return []
    }
    return deleteTransaction(ids)
  }

  function facetValues(input: z.infer<typeof FacetQuerySchema>) {
    const result: z.infer<typeof FacetValuesSchema> = { tags: [], authors: [], platforms: [] }
    const pattern = likePattern(input.query)
    if (input.dimension === 'all' || input.dimension === 'tags') {
      result.tags = z.array(FacetValueSchema).parse(db.query(`SELECT tag AS value, tag AS label, COUNT(DISTINCT image_id) AS count FROM image_tags
        WHERE tag LIKE ? ESCAPE '\\' GROUP BY tag ORDER BY count DESC, tag LIMIT ?`).all(pattern, input.limit))
    }
    if (input.dimension === 'all' || input.dimension === 'authors') {
      result.authors = z.array(FacetValueSchema).parse(db.query(`SELECT author_id AS value, MAX(author_name) AS label, COUNT(*) AS count FROM images
        WHERE author_id LIKE ? ESCAPE '\\' OR author_name LIKE ? ESCAPE '\\'
        GROUP BY author_id ORDER BY count DESC, author_id LIMIT ?`).all(pattern, pattern, input.limit))
    }
    if (input.dimension === 'all' || input.dimension === 'platforms') {
      result.platforms = z.array(FacetValueSchema).parse(db.query(`SELECT platform AS value, platform AS label, COUNT(*) AS count FROM images
        WHERE platform LIKE ? ESCAPE '\\' GROUP BY platform ORDER BY count DESC, platform LIMIT ?`).all(pattern, input.limit))
    }
    return result
  }

  return { pick, facets, facetValues, deleteImages }
}

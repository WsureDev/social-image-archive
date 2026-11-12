import { z } from 'zod'
import { ImageMessageSchema } from '../message'
import { apiParams, type GalleryState } from './query'

export const GalleryImageSchema = z.object({
  id: z.string(),
  image: z.string(),
  thumbnail: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  bytes: z.number(),
  payload: ImageMessageSchema
})
export const GalleryResultSchema = z.object({
  images: z.array(GalleryImageSchema),
  total: z.number().nonnegative(),
  offset: z.number().nonnegative(),
  limit: z.number().positive()
})
export const FacetsSchema = z.object({
  platforms: z.array(z.string()),
  tags: z.array(z.string()),
  authors: z.array(z.object({ id: z.string(), name: z.string() })),
  dateRange: z.object({ from: z.string().nullable(), to: z.string().nullable() })
})
export type GalleryImage = z.infer<typeof GalleryImageSchema>
export type GalleryResult = z.infer<typeof GalleryResultSchema>

export async function fetchPage(state: GalleryState, page: number, signal?: AbortSignal) {
  const response = await fetch('/api/pick?' + apiParams(state, page), { signal })
  if (!response.ok) {
    throw new Error('图片查询失败（HTTP ' + response.status + '）')
  }
  return GalleryResultSchema.parse(await response.json())
}

export async function fetchFacets() {
  const response = await fetch('/api/facets')
  if (!response.ok) {
    throw new Error('筛选选项暂时不可用')
  }
  return FacetsSchema.parse(await response.json())
}

export async function deleteImages(ids: string[]) {
  const response = await fetch('/api/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids })
  })
  if (!response.ok) {
    throw new Error('批量删除失败（HTTP ' + response.status + '）')
  }
  return z.object({ deleted: z.number() }).parse(await response.json())
}

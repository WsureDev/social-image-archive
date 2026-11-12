import { z } from 'zod'

export const GalleryStateSchema = z.object({
  q: z.string().default(''),
  author: z.string().default(''),
  tag: z.string().default(''),
  platform: z.string().default(''),
  from: z.string().default(''),
  to: z.string().default(''),
  order: z.enum(['newest', 'oldest', 'random']).default('newest').catch('newest'),
  limit: z.coerce.number().pipe(z.union([z.literal(24), z.literal(48), z.literal(96)])).default(24).catch(24),
  page: z.coerce.number().int().min(1).default(1).catch(1),
  seed: z.coerce.number().int().min(0).max(4294967295).default(0).catch(0),
  snapshot: z.iso.datetime().default(function () { return new Date().toISOString() }).catch(function () { return new Date().toISOString() })
})
export type GalleryState = z.infer<typeof GalleryStateSchema>

export function readLocation() {
  return GalleryStateSchema.parse(Object.fromEntries(new URLSearchParams(location.search)))
}

export function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

export function searchParams(state: GalleryState) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(state)) {
    if (value !== '') {
      params.set(key, String(value))
    }
  }
  return params
}

export function apiParams(state: GalleryState, page: number) {
  const params = searchParams(state)
  params.delete('page')
  params.delete('snapshot')
  params.set('until', state.snapshot)
  params.set('offset', String((page - 1) * state.limit))
  if (state.from) {
    params.set('from', state.from + 'T00:00:00+08:00')
  } else {
    params.delete('from')
  }
  if (state.to) {
    params.set('to', state.to + 'T23:59:59+08:00')
  } else {
    params.delete('to')
  }
  return params
}

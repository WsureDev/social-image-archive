import { z } from 'zod'

export const HttpUrlSchema = z.url().refine(function (value) {
  const protocol = new URL(value).protocol
  return protocol === 'http:' || protocol === 'https:'
}, 'Only HTTP(S) URLs are supported')

export const ImageMessageSchema = z.object({
  platform: z.string().trim().min(1).max(80),
  postId: z.string().max(200).optional(),
  postUrl: HttpUrlSchema.optional(),
  imageUrl: HttpUrlSchema,
  tags: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  author: z.object({
    id: z.string().min(1).max(200),
    name: z.string().min(1).max(200)
  }),
  publishedAt: z.iso.datetime({ offset: true }),
  referer: HttpUrlSchema.optional()
})

export type ImageMessage = z.infer<typeof ImageMessageSchema>

export async function messageId(message: ImageMessage) {
  const identity = JSON.stringify([message.platform, message.imageUrl])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
  return Array.from(new Uint8Array(digest)).map(function (byte) {
    return byte.toString(16).padStart(2, '0')
  }).join('')
}

export const LeaseSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  leaseToken: z.uuid(),
  message: ImageMessageSchema
})

export const ClaimResponseSchema = z.object({ job: LeaseSchema.nullable() })
export type Lease = z.infer<typeof LeaseSchema>

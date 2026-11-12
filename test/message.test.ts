import { expect, test } from 'bun:test'
import { ImageMessageSchema, messageId } from '../src/message'

const input = {
  platform: 'example',
  imageUrl: 'https://cdn.example/a.jpg?size=original',
  tags: ['夜景'],
  author: { id: 'u1', name: '作者' },
  publishedAt: '2026-10-30T20:00:00+08:00'
}

test('reject non-HTTP URLs and ambiguous publication times', function () {
  expect(ImageMessageSchema.safeParse({ ...input, imageUrl: 'file:///etc/passwd' }).success).toBe(false)
  expect(ImageMessageSchema.safeParse({ ...input, publishedAt: '2026-10-30T20:00:00' }).success).toBe(false)
  expect(ImageMessageSchema.parse(input).publishedAt).toBe(input.publishedAt)
})

test('retries preserve identity while distinct images stay separate', async function () {
  const message = ImageMessageSchema.parse(input)
  expect(await messageId(message)).toBe(await messageId({ ...message, tags: ['new-tag'] }))
  expect(await messageId(message)).not.toBe(await messageId({ ...message, imageUrl: 'https://cdn.example/b.jpg' }))
  expect(await messageId(message)).not.toBe(await messageId({ ...message, platform: 'other' }))
})

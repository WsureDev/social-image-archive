import { expect, test } from 'bun:test'
import { enqueueImage } from '../src/cloud/enqueue'
import { ImageMessageSchema } from '../src/message'

const message = ImageMessageSchema.parse({
  platform: 'example', imageUrl: 'https://cdn.example/image.png',
  author: { id: 'u1', name: 'author' }, publishedAt: '2026-10-30T00:00:00Z'
})

test('a primary queue failure still leaves a delayed recovery copy', async function () {
  const recoveryCopies: string[] = []
  const timer = {
    async send(body: string, options?: QueueSendOptions) {
      expect(options?.delaySeconds).toBe(18 * 3600)
      recoveryCopies.push(body)
      return { metadata: { metrics: { backlogCount: 1, backlogBytes: body.length } } }
    }
  }
  const primary = {
    async send() { throw new Error('primary unavailable') }
  }
  await expect(enqueueImage(message, primary, timer)).rejects.toThrow('primary unavailable')
  expect(recoveryCopies).toHaveLength(1)
  expect(ImageMessageSchema.parse(JSON.parse(recoveryCopies[0]))).toEqual(message)
})

test('do not accept a primary message if scheduling recovery failed', async function () {
  let sent = false
  const primary = {
    async send() {
      sent = true
      return { metadata: { metrics: { backlogCount: 1, backlogBytes: 0 } } }
    }
  }
  const timer = {
    async send() { throw new Error('timer unavailable') }
  }
  await expect(enqueueImage(message, primary, timer)).rejects.toThrow('timer unavailable')
  expect(sent).toBe(false)
})

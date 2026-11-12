import { z } from 'zod'
import { config } from './config'
import { createQueueAuth } from './auth'

const auth = createQueueAuth(config.CLOUDFLARE_API_TOKEN)

const PullResponseSchema = z.object({
  success: z.literal(true),
  result: z.object({
    messages: z.array(z.object({ body: z.string(), lease_id: z.string() }))
  })
})

type QueueRequest =
  | { batch_size: number, visibility_timeout_ms: number }
  | { acks: { lease_id: string }[], retries: never[] }

export async function queueRequest(action: 'pull' | 'ack', body: QueueRequest) {
  if (!config.CF_ACCOUNT_ID || !config.CF_QUEUE_ID) {
    throw new Error('Set CF_ACCOUNT_ID and CF_QUEUE_ID')
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.CF_ACCOUNT_ID}/queues/${config.CF_QUEUE_ID}/messages/${action}`, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + await auth.token(), 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000)
    })
    if (response.status === 401 && attempt === 0) {
      await response.body?.cancel()
      auth.invalidate()
      continue
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error('Queues ' + action + ' HTTP ' + response.status)
    }
    return response.json()
  }
  throw new Error('Cloudflare authentication failed')
}

export async function pull() {
  return PullResponseSchema.parse(await queueRequest('pull', { batch_size: 1, visibility_timeout_ms: 180_000 })).result.messages
}

export async function acknowledge(leaseId: string) {
  const result = await queueRequest('ack', { acks: [{ lease_id: leaseId }], retries: [] })
  z.object({ success: z.literal(true) }).parse(result)
}

export async function cloudRequest(path: string, body: object) {
  const response = await fetch(new URL(path, config.QUEUE_WORKER_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) {
    throw new Error('Worker ' + path + ' HTTP ' + response.status)
  }
  return response.json()
}

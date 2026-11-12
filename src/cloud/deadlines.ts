import { ImageMessageSchema, messageId } from '../message'

export async function deadlines(batch: MessageBatch<string>, env: Env) {
  for (const item of batch.messages) {
    try {
      const message = ImageMessageSchema.parse(JSON.parse(item.body))
      const id = await messageId(message)
      const now = Date.now()
      await env.DB.prepare(`
        INSERT OR IGNORE INTO jobs (id, payload, created_at, available_at)
        SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM completions WHERE id = ?)
      `).bind(id, JSON.stringify(message), now, now, id).run()
      item.ack()
    } catch (error) {
      console.error(JSON.stringify({ event: 'deadline_failed', id: item.id, error: String(error) }))
      item.retry({ delaySeconds: 300 })
    }
  }
}

export async function cleanup(_event: ScheduledController, env: Env) {
  const cutoff = Date.now() - 7 * 86400_000
  await env.DB.batch([
    env.DB.prepare('DELETE FROM completions WHERE id IN (SELECT id FROM completions WHERE completed_at < ? LIMIT 2000)').bind(cutoff),
    env.DB.prepare("DELETE FROM jobs WHERE id IN (SELECT id FROM jobs WHERE state = 'done' AND finished_at < ? LIMIT 2000)").bind(cutoff)
  ])
}

import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { sValidator } from '@hono/standard-validator'
import { z } from 'zod'
import { ImageMessageSchema } from '../message'
import { deadlines, cleanup } from './deadlines'
import { enqueueImage } from './enqueue'

const FailureSchema = z.object({
  leaseToken: z.uuid(),
  error: z.string().max(1000).default('download failed')
})

const app = new Hono<{ Bindings: Env }>()
app.use('*', bodyLimit({ maxSize: 32 * 1024 }))
app.get('/health', function (c) {
  return c.json({ ok: true })
})

app.post('/v1/images', sValidator('json', ImageMessageSchema), async function (c) {
  const message = c.req.valid('json')
  const id = await enqueueImage(message, c.env.IMAGES, c.env.DEADLINES)
  return c.json({ id, deadlineHours: 18 }, 202)
})

app.post('/v1/completed/:id', async function (c) {
  const id = c.req.param('id')
  if (!/^[a-f0-9]{64}$/.test(id)) {
    return c.json({ error: 'invalid id' }, 400)
  }
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT OR REPLACE INTO completions (id, completed_at) VALUES (?, ?)').bind(id, Date.now()),
    c.env.DB.prepare("UPDATE jobs SET state = 'done', finished_at = ?, lease_token = NULL WHERE id = ?").bind(Date.now(), id)
  ])
  return c.json({ ok: true })
})

app.post('/v1/claim', async function (c) {
  const now = Date.now()
  const token = crypto.randomUUID()
  const row = await c.env.DB.prepare(`
    UPDATE jobs SET lease_token = ?, available_at = ?
    WHERE id = (
      SELECT id FROM jobs WHERE state = 'pending' AND available_at <= ?
      ORDER BY available_at, created_at LIMIT 1
    ) RETURNING id, payload
  `).bind(token, now + 180_000, now).first<{ id: string, payload: string }>()
  if (!row) {
    return c.json({ job: null })
  }
  return c.json({ job: { id: row.id, leaseToken: token, message: JSON.parse(row.payload) } })
})

app.post('/v1/jobs/:id/fail', sValidator('json', FailureSchema), async function (c) {
  const { leaseToken, error } = c.req.valid('json')
  const result = await c.env.DB.prepare(`
    UPDATE jobs SET failures = failures + 1, last_error = ?, lease_token = NULL,
      available_at = ? + MIN(3600000, 30000 * (1 << MIN(failures, 7))),
      state = CASE WHEN failures >= 7 THEN 'dead' ELSE 'pending' END
    WHERE id = ? AND lease_token = ? AND state = 'pending'
  `).bind(error, Date.now(), c.req.param('id'), leaseToken).run()
  if (result.meta.changes !== 1) {
    return c.json({ error: 'lease lost' }, 409)
  }
  return c.json({ ok: true })
})

app.get('/v1/jobs/dead', async function (c) {
  const result = await c.env.DB.prepare(
    "SELECT id, payload, failures, last_error FROM jobs WHERE state = 'dead' ORDER BY created_at LIMIT 100"
  ).all()
  return c.json({ jobs: result.results })
})

app.post('/v1/jobs/:id/retry', async function (c) {
  const result = await c.env.DB.prepare(`
    UPDATE jobs SET state = 'pending', failures = 0, available_at = ?, last_error = NULL
    WHERE id = ? AND state = 'dead'
  `).bind(Date.now(), c.req.param('id')).run()
  return c.json({ requeued: result.meta.changes === 1 })
})

app.onError(function (error, c) {
  console.error(JSON.stringify({ event: 'request_failed', message: error.message }))
  return c.json({ error: 'internal error' }, 500)
})

export default {
  fetch: app.fetch,
  queue: deadlines,
  scheduled: cleanup
} satisfies ExportedHandler<Env, string>

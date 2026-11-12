import { Hono } from 'hono'
import { z } from 'zod'
import { sValidator } from '@hono/standard-validator'
import { join } from 'node:path'
import { unlink } from 'node:fs/promises'
import { openArchive } from './archive'
import { PickSchema } from './catalog'
import { createThumbnails, ThumbnailParamsSchema } from './thumbnails'
import { archiveDir, config } from './config'
import { createShutdownSignal } from './shutdown'
import { createMcpHandler } from '../mcp/http'
import { exportArchive } from './export'

export function startGallery() {
  const archive = openArchive(archiveDir)
  const thumbnails = createThumbnails(archiveDir)
  const mcp = createMcpHandler(archive, thumbnails.size, archiveDir, {
    defaultMaxPick: config.MCP_MAX_PICK, trustProxy: config.MCP_TRUST_PROXY
  })
  const app = new Hono()
  app.all('/mcp', function (c) { return mcp(c.req.raw) })
  app.get('/health', function (c) { return c.json({ ok: true }) })
  app.get('/api/export.jsonl', function () {
    return exportArchive(archiveDir)
  })
  app.get('/api/pick', sValidator('query', PickSchema), async function (c) {
    const result = archive.pick(c.req.valid('query'))
    const images = await Promise.all(result.images.map(async function (image) {
      return { ...image, ...await thumbnails.size(image.filename) }
    }))
    return c.json({ ...result, images })
  })
  app.get('/api/facets', function (c) {
    return c.json(archive.facets())
  })
  const DeleteSchema = z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(96) })
  app.post('/api/delete', sValidator('json', DeleteSchema), async function (c) {
    const rows = archive.deleteImages(c.req.valid('json').ids)
    await Promise.all(rows.flatMap(function (row) {
      return [
        unlink(join(archiveDir, 'objects', row.filename)).catch(function () {}),
        unlink(join(archiveDir, 'thumbnails', row.filename + '.webp')).catch(function () {})
      ]
    }))
    return c.json({ deleted: rows.length })
  })
  app.get('/thumbnails/:filename', sValidator('param', ThumbnailParamsSchema), async function (c) {
    const path = await thumbnails.get(c.req.valid('param').filename)
    if (!path) {
      return c.notFound()
    }
    return new Response(Bun.file(path), {
      headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=31536000, immutable' }
    })
  })
  app.get('/objects/:filename', async function (c) {
    const filename = c.req.param('filename')
    if (!/^[a-f0-9]{64}\.(jpg|png|webp|gif|avif)$/.test(filename)) {
      return c.notFound()
    }
    const file = Bun.file(join(archiveDir, 'objects', filename))
    if (!await file.exists()) {
      return c.notFound()
    }
    return new Response(file, { headers: { 'cache-control': 'public, max-age=31536000, immutable' } })
  })
  const AssetParamsSchema = z.object({ filename: z.string().regex(/^[a-zA-Z0-9_-]+\.(js|css)$/) })
  app.get('/assets/:filename', sValidator('param', AssetParamsSchema), async function (c) {
    const file = Bun.file(new URL('../../dist/gallery/' + c.req.valid('param').filename, import.meta.url))
    if (!await file.exists()) {
      return c.notFound()
    }
    return new Response(file, { headers: { 'cache-control': 'no-cache' } })
  })
  app.get('/', function () {
    return new Response(Bun.file(new URL('../gallery/index.html', import.meta.url)), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }
    })
  })

  const server = Bun.serve({ hostname: config.HOST, port: config.PORT, fetch: app.fetch })
  console.log('Gallery listening on http://' + config.HOST + ':' + config.PORT)
  return server
}

if (import.meta.main) {
  const signal = createShutdownSignal()
  const server = startGallery()
  signal.addEventListener('abort', function () {
    void server.stop(true)
  }, { once: true })
}

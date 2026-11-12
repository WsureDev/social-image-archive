import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { archiveImage } from '../src/local/download'
import type { Archive } from '../src/local/archive'

test('commit only after complete download; reject error pages and clean failed partials', async function () {
  const directory = await mkdtemp('/tmp/social-image-download-')
  await mkdir(join(directory, 'objects'))
  await mkdir(join(directory, 'tmp'))
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname
      if (path === '/html') {
        return new Response('<html>not an image</html>', { headers: { 'content-type': 'text/html' } })
      }
      if (path === '/empty') {
        return new Response('', { headers: { 'content-type': 'image/png' } })
      }
      return new Response(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), { headers: { 'content-type': 'image/png' } })
    }
  })
  let stores = 0
  const archive: Archive = {
    find() { return null },
    pick() { return { images: [], total: 0, limit: 24, offset: 0 } },
    facets() { return { platforms: [], tags: [], authors: [], dateRange: { from: null, to: null } } },
    facetValues() { return { platforms: [], tags: [], authors: [] } },
    deleteImages() { return [] },
    store(_id, _message, filename, _sha256, bytes) {
      expect(Bun.file(join(directory, 'objects', filename)).size).toBe(bytes)
      stores += 1
    }
  }
  const message = {
    platform: 'example', imageUrl: String(server.url), tags: [],
    author: { id: 'u1', name: 'author' }, publishedAt: '2026-10-30T00:00:00Z'
  }
  try {
    await archiveImage('test', message, archive, directory)
    expect(stores).toBe(1)
    await expect(archiveImage('html', { ...message, imageUrl: new URL('/html', server.url).href }, archive, directory)).rejects.toThrow('unsupported image content type')
    await expect(archiveImage('empty', { ...message, imageUrl: new URL('/empty', server.url).href }, archive, directory)).rejects.toThrow('empty image')
    expect(stores).toBe(1)
    expect(await readdir(join(directory, 'tmp'))).toEqual([])
    expect(await readdir(join(directory, 'objects'))).toHaveLength(1)
  } finally {
    server.stop(true)
    await rm(directory, { recursive: true, force: true })
  }
})

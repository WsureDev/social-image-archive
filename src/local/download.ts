import { createHash } from 'node:crypto'
import { rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { ImageMessage } from '../message'
import type { Archive } from './archive'

export async function archiveImage(id: string, message: ImageMessage, archive: Archive, directory: string) {
  const existing = archive.find(id)
  if (existing && await Bun.file(join(directory, 'objects', existing.filename)).exists()) {
    return
  }
  const headers = new Headers({ 'user-agent': 'SocialImageArchive/0.1' })
  if (message.referer) {
    headers.set('referer', message.referer)
  }
  const response = await fetch(message.imageUrl, { headers, signal: AbortSignal.timeout(60_000) })
  if (!response.ok || !response.body) {
    throw new Error('image HTTP ' + response.status)
  }
  const extensions = new Map([
    ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'],
    ['image/gif', 'gif'], ['image/avif', 'avif']
  ])
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  const extension = extensions.get(contentType)
  if (!extension) {
    await response.body.cancel()
    throw new Error('unsupported image content type: ' + contentType)
  }
  const temp = join(directory, 'tmp', crypto.randomUUID() + '.partial')
  const writer = Bun.file(temp).writer()
  const reader = response.body.getReader()
  const hash = createHash('sha256')
  let bytes = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        break
      }
      bytes += chunk.value.byteLength
      if (bytes > 30 * 1024 * 1024) {
        throw new Error('image exceeds 30 MiB')
      }
      hash.update(chunk.value)
      writer.write(chunk.value)
      await writer.flush()
    }
    if (bytes === 0) {
      throw new Error('empty image')
    }
    await writer.end()
    const sha256 = hash.digest('hex')
    const filename = sha256 + '.' + extension
    await rename(temp, join(directory, 'objects', filename))
    archive.store(id, message, filename, sha256, bytes)
  } catch (error) {
    await reader.cancel().catch(function () {})
    await Promise.resolve(writer.end()).catch(function () {})
    await unlink(temp).catch(function () {})
    throw error
  }
}

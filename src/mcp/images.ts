import { join } from 'node:path'
import type { Archive } from '../local/archive'
import type { RequestPolicy } from './policy'

export type ImageSizeReader = (filename: string) => Promise<{ width: number, height: number }>

export function createMcpImages(archive: Archive, readSize: ImageSizeReader, directory: string, policy: RequestPolicy) {
  async function item(id: string) {
    const row = archive.find(id)
    if (!row) {
      return null
    }
    const file = Bun.file(join(directory, 'objects', row.filename))
    if (!await file.exists()) {
      return null
    }
    const size = await readSize(row.filename)
    return {
      id: row.id,
      author: row.payload.author,
      platform: row.payload.platform,
      tags: row.payload.tags,
      publishedAt: row.payload.publishedAt,
      archivedAt: row.archived_at,
      ...size,
      bytes: row.bytes,
      sha256: row.sha256,
      mimeType: file.type,
      originalUrl: new URL('/objects/' + row.filename, policy.origin).href,
      postUrl: row.payload.postUrl
    }
  }

  return { item }
}

import { expect, test } from 'bun:test'
import { serializeExportRow } from '../src/local/export'

test('JSONL export preserves source metadata and strips storage and service details', function () {
  const line = serializeExportRow({
    id: 'archive-id',
    payload: JSON.stringify({
      platform: 'example',
      imageUrl: 'https://cdn.example/image.jpg?name=orig',
      postId: 'post-123',
      postUrl: 'https://social.example/posts/123',
      tags: ['夜景', '风景'],
      author: { id: 'author-123', name: '作者\n名称', localPath: '/app/data/secret' },
      publishedAt: '2026-11-10T08:00:00+08:00',
      referer: 'http://192.0.2.10:19280/',
      originalUrl: 'http://192.0.2.10:19280/objects/image.jpg',
      filename: '/app/data/objects/image.jpg'
    }),
    archived_at: '2026-11-10T00:01:00Z',
    filename: '/path/to/social-image-archive/data-docker/objects/image.jpg',
    thumbnail: 'http://192.0.2.10:19280/thumbnails/image.jpg'
  })
  expect(JSON.parse(line)).toEqual({
    id: 'archive-id',
    platform: 'example',
    imageUrl: 'https://cdn.example/image.jpg?name=orig',
    postId: 'post-123',
    postUrl: 'https://social.example/posts/123',
    tags: ['夜景', '风景'],
    author: { id: 'author-123', name: '作者\n名称' },
    publishedAt: '2026-11-10T08:00:00+08:00',
    archivedAt: '2026-11-10T00:01:00Z'
  })
  expect(line.trimEnd().split('\n')).toHaveLength(1)
  expect(line.endsWith('\n')).toBe(true)
  expect(line).not.toContain('192.0.2.10')
  expect(line).not.toContain('/app/data')
  expect(line).not.toContain('/mnt/storage')
})

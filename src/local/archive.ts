import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ImageMessage } from '../message'
import { createCatalog, StoredImageSchema } from './catalog'

export function openArchive(directory: string) {
  mkdirSync(join(directory, 'objects'), { recursive: true })
  mkdirSync(join(directory, 'tmp'), { recursive: true })
  const db = new Database(join(directory, 'archive.sqlite'), { create: true })
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY, payload TEXT NOT NULL, filename TEXT NOT NULL,
      sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, platform TEXT NOT NULL,
      author_id TEXT NOT NULL, author_name TEXT NOT NULL, published_at TEXT NOT NULL,
      archived_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS images_date ON images(published_at);
    CREATE INDEX IF NOT EXISTS images_author ON images(author_id, published_at);
    CREATE INDEX IF NOT EXISTS images_platform ON images(platform, published_at);
    CREATE TABLE IF NOT EXISTS image_tags (
      image_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY(image_id, tag)
    );
    CREATE INDEX IF NOT EXISTS tags_lookup ON image_tags(tag, image_id);
  `)

  function find(id: string) {
    const row = db.query('SELECT * FROM images WHERE id = ?').get(id)
    if (!row) {
      return null
    }
    return StoredImageSchema.parse(row)
  }

  const storeTransaction = db.transaction(function (id: string, message: ImageMessage, filename: string, sha256: string, bytes: number) {
    db.query(`INSERT INTO images
      (id, payload, filename, sha256, bytes, platform, author_id, author_name, published_at, archived_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET filename = excluded.filename, sha256 = excluded.sha256, bytes = excluded.bytes`)
      .run(id, JSON.stringify(message), filename, sha256, bytes, message.platform,
        message.author.id, message.author.name, new Date(message.publishedAt).toISOString(), new Date().toISOString())
    for (const tag of new Set(message.tags)) {
      db.query('INSERT OR IGNORE INTO image_tags (image_id, tag) VALUES (?, ?)').run(id, tag)
    }
  })

  function store(id: string, message: ImageMessage, filename: string, sha256: string, bytes: number) {
    storeTransaction(id, message, filename, sha256, bytes)
  }

  return { find, store, ...createCatalog(db) }
}

export type Archive = ReturnType<typeof openArchive>

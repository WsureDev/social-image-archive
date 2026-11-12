import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { z } from 'zod'
import { ImageMessageSchema } from '../message'

const SourceMetadataSchema = ImageMessageSchema.pick({
  platform: true,
  postId: true,
  postUrl: true,
  imageUrl: true,
  tags: true,
  author: true,
  publishedAt: true
})
const ExportRowSchema = z.object({
  id: z.string(),
  payload: z.string().transform(function (value) {
    return SourceMetadataSchema.parse(JSON.parse(value))
  }),
  archived_at: z.string()
})
const ExportBatchSchema = z.array(ExportRowSchema.extend({ position: z.number() }))
const ExportBoundarySchema = z.object({ position: z.number() })

function formatExportRow(row: z.output<typeof ExportRowSchema>) {
  return JSON.stringify({ id: row.id, ...row.payload, archivedAt: row.archived_at }) + '\n'
}

export function serializeExportRow(input: unknown) {
  return formatExportRow(ExportRowSchema.parse(input))
}

export function exportArchive(directory: string) {
  const db = new Database(join(directory, 'archive.sqlite'), { readonly: true })
  let closed = false

  function close() {
    if (!closed) {
      closed = true
      db.close()
    }
  }

  try {
    const boundary = ExportBoundarySchema.parse(db.query('SELECT COALESCE(MAX(rowid), 0) AS position FROM images').get())
    const statement = db.query('SELECT rowid AS position, id, payload, archived_at FROM images WHERE rowid > ? AND rowid <= ? ORDER BY rowid LIMIT 100')
    const encoder = new TextEncoder()
    let position = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        try {
          const rows = ExportBatchSchema.parse(statement.all(position, boundary.position))
          if (rows.length === 0) {
            close()
            controller.close()
            return
          }
          const lines = rows.map(function (row) {
            position = row.position
            return formatExportRow(row)
          }).join('')
          controller.enqueue(encoder.encode(lines))
        } catch (error) {
          close()
          controller.error(error)
        }
      },
      cancel() {
        close()
      }
    })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    return new Response(body, {
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'content-disposition': 'attachment; filename="image-archive-' + timestamp + '.jsonl"',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff'
      }
    })
  } catch (error) {
    close()
    throw error
  }
}

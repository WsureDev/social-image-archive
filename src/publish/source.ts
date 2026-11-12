import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { z } from 'zod'
import { serializeExportRow } from '../local/export'
import { SharedRecordSchema } from './records'

const RowsSchema = z.array(z.object({ id: z.string(), payload: z.string(), archived_at: z.string() }))

export function readRecords(directory: string) {
  const db = new Database(join(directory, 'archive.sqlite'), { readonly: true })
  try {
    db.exec('PRAGMA busy_timeout = 5000')
    const rows = RowsSchema.parse(db.query('SELECT id, payload, archived_at FROM images ORDER BY archived_at, id').all())
    return rows.map(function (row) {
      return SharedRecordSchema.parse(JSON.parse(serializeExportRow(row)))
    })
  } finally {
    db.close()
  }
}

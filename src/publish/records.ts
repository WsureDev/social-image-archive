import { createHash } from 'node:crypto'
import { z } from 'zod'
import { ImageMessageSchema } from '../message'
import { dateKey, weekKey } from './calendar'

export const SharedRecordSchema = ImageMessageSchema.omit({ referer: true }).extend({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  archivedAt: z.iso.datetime({ offset: true })
})
export type SharedRecord = z.infer<typeof SharedRecordSchema>

export function sha256(content: string) {
  return createHash('sha256').update(content).digest('hex')
}

export function jsonl(records: SharedRecord[]) {
  if (records.length === 0) {
    return ''
  }
  return records.map(function (record) { return JSON.stringify(record) }).join('\n') + '\n'
}

export function buildSnapshot(input: SharedRecord[], day: string, timezone: string) {
  const records = z.array(SharedRecordSchema).parse(input).sort(function (left, right) {
    return new Date(left.archivedAt).getTime() - new Date(right.archivedAt).getTime() || left.id.localeCompare(right.id)
  })
  const weeks = new Map<string, SharedRecord[]>()
  for (const record of records) {
    const key = weekKey(record.archivedAt, timezone)
    const bucket = weeks.get(key) ?? []
    bucket.push(record)
    weeks.set(key, bucket)
  }
  const files = new Map<string, string>()
  const entries = []
  for (const [week, bucket] of [...weeks].sort()) {
    const path = 'weeks/' + week + '.jsonl'
    const content = jsonl(bucket)
    files.set(path, content)
    entries.push({ path, records: bucket.length, sha256: sha256(content) })
  }
  const manifest = { version: 1, publicationDate: day, timezone, records: records.length, weeks: entries }
  files.set('manifest.json', JSON.stringify(manifest, null, 2) + '\n')
  return { files, records, manifest }
}

export function monthRecords(records: SharedRecord[], month: string, timezone: string) {
  return records.filter(function (record) {
    return dateKey(new Date(record.archivedAt), timezone).startsWith(month)
  })
}

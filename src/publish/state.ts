import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { SharedRecordSchema, sha256, type SharedRecord } from './records'

const SnapshotSchema = z.object({ key: z.string(), day: z.string(), records: z.array(SharedRecordSchema) })
const SuccessSchema = z.object({ state: z.literal('succeeded'), configKey: z.string(), publicationDate: z.string() })
const MonthSnapshotSchema = z.object({ month: z.string(), content: z.string(), records: z.number(), commit: z.string(), timezone: z.string() })

export async function frozenMonth(directory: string, key: string, snapshot: z.infer<typeof MonthSnapshotSchema>) {
  const parent = join(directory, 'releases', sha256(key).slice(0, 16))
  const path = join(parent, snapshot.month + '.json')
  try {
    return MonthSnapshotSchema.parse(JSON.parse(await readFile(path, 'utf8')))
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error
    }
  }
  await mkdir(parent, { recursive: true, mode: 0o700 })
  const temporary = path + '.' + process.pid + '.tmp'
  await writeFile(temporary, JSON.stringify(snapshot) + '\n', { mode: 0o600 })
  await rename(temporary, path)
  return snapshot
}

export async function alreadyPublished(directory: string, key: string, day: string) {
  try {
    const saved = SuccessSchema.safeParse(JSON.parse(await readFile(join(directory, 'status.json'), 'utf8')))
    return saved.success && saved.data.configKey === key && saved.data.publicationDate === day
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error
    }
    return false
  }
}

export async function dailyRecords(directory: string, key: string, day: string, readSource: () => SharedRecord[]) {
  const path = join(directory, 'snapshot.json')
  try {
    const saved = SnapshotSchema.parse(JSON.parse(await readFile(path, 'utf8')))
    if (saved.key === key && saved.day === day) {
      return saved.records
    }
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error
    }
  }
  const records = readSource()
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporary = path + '.' + process.pid + '.tmp'
  await writeFile(temporary, JSON.stringify({ key, day, records }) + '\n', { mode: 0o600 })
  await rename(temporary, path)
  return records
}

export async function writeState(directory: string, value: object) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporary = join(directory, 'status.' + process.pid + '.tmp')
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  await rename(temporary, join(directory, 'status.json'))
}

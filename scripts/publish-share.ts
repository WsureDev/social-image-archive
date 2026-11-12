import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { publicationDay } from '../src/publish/calendar'
import { ShareReadme } from '../src/publish/commit'
import { loadConfig } from '../src/publish/config'
import { buildSnapshot, jsonl, monthRecords } from '../src/publish/records'
import { archiveMonths, publishArchive } from '../src/publish/run'
import { readRecords } from '../src/publish/source'

const config = loadConfig()
const command = process.argv[2] ?? 'publish'

try {
  if (command === 'status') {
    console.log(await readFile(join(config.stateDirectory, 'status.json'), 'utf8'))
  } else if (command === 'publish') {
    console.log(JSON.stringify(await publishArchive(config)))
  } else if (command === 'preview') {
    const destination = process.argv[3]
    if (!destination) { throw new Error('preview requires a new output directory') }
    const day = publicationDay(new Date(), config.timezone, config.dailyTime)
    const snapshot = buildSnapshot(readRecords(config.archiveDirectory), day, config.timezone)
    const months = archiveMonths(snapshot.records, day, config.timezone)
    const output = resolve(destination)
    await mkdir(output, { mode: 0o700 })
    await mkdir(join(output, 'weeks'))
    await mkdir(join(output, 'releases'))
    for (const [path, content] of snapshot.files) { await writeFile(join(output, path), content, { flag: 'wx' }) }
    await writeFile(join(output, 'README.md'), ShareReadme, { flag: 'wx' })
    for (const month of months) {
      await writeFile(join(output, 'releases', month + '.jsonl'), jsonl(monthRecords(snapshot.records, month, config.timezone)), { flag: 'wx' })
    }
    console.log(JSON.stringify({ preview: output, records: snapshot.records.length, weeks: snapshot.manifest.weeks.length, completedMonths: months }))
  } else {
    throw new Error('Usage: share-publish.sh publish | preview <new-output-directory> | status')
  }
} catch (error) {
  let message = 'Unexpected publisher failure'
  if (error instanceof Error) { message = error.message }
  console.error(message)
  process.exitCode = 1
}

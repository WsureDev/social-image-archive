import { join } from 'node:path'
import { completedMonths, dateKey, publicationDay } from './calendar'
import { commitSnapshot } from './commit'
import { readToken, type PublisherConfig } from './config'
import { buildSnapshot, jsonl, monthRecords, sha256, type SharedRecord } from './records'
import { publishMonth } from './release'
import { ensureRepository } from './repository'
import { readRecords } from './source'
import { alreadyPublished, dailyRecords, frozenMonth, writeState } from './state'

export function archiveMonths(records: SharedRecord[], day: string, timezone: string) {
  if (records.length === 0) { return [] }
  const first = dateKey(new Date(records[0].archivedAt), timezone).slice(0, 7)
  return completedMonths(first, day.slice(0, 7))
}

export async function publishArchive(config: PublisherConfig, signal?: AbortSignal) {
  try {
    if (!config.enabled) { return { state: 'disabled' } }
    signal?.throwIfAborted()
    const now = new Date()
    const day = publicationDay(now, config.timezone, config.dailyTime)
    const token = await readToken(config.tokenFile)
    const github = await ensureRepository(token, config.repositoryName, undefined, signal)
    const repository = github.repository
    const configKey = [repository, config.branch, config.timezone].join('|')
    if (await alreadyPublished(config.stateDirectory, configKey, day)) {
      return { state: 'succeeded', publicationDate: day, skipped: true }
    }
    const records = await dailyRecords(config.stateDirectory, configKey, day, function () { return readRecords(config.archiveDirectory) })
    const snapshot = buildSnapshot(records, day, config.timezone)
    const commit = await commitSnapshot({
      repository, token, branch: config.branch, files: snapshot.files, day, signal,
      directory: join(config.stateDirectory, 'checkouts', sha256(repository + '|' + config.branch).slice(0, 16))
    })
    const releases = []
    for (const month of archiveMonths(snapshot.records, day, config.timezone)) {
      const monthly = monthRecords(snapshot.records, month, config.timezone)
      const frozen = await frozenMonth(config.stateDirectory, configKey, {
        month, content: jsonl(monthly), records: monthly.length, commit: commit.sha, timezone: config.timezone
      })
      releases.push(await publishMonth(github, month, frozen.content, frozen.records, frozen.commit, frozen.timezone))
    }
    const result = {
      state: 'succeeded', configKey, checkedAt: now.toISOString(), publicationDate: day, repository,
      commit: commit.sha, changed: commit.changed, commitUrl: 'https://github.com/' + repository + '/commit/' + commit.sha,
      records: snapshot.records.length, weeks: snapshot.manifest.weeks.length, releases
    }
    await writeState(config.stateDirectory, result)
    return result
  } catch (error) {
    if (!signal?.aborted) {
      let message = 'Unexpected publisher failure'
      if (error instanceof Error) { message = error.message }
      await writeState(config.stateDirectory, { state: 'failed', checkedAt: new Date().toISOString(), error: message })
    }
    throw error
  }
}

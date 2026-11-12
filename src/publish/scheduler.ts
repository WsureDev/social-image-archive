import { stat } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import { loadConfig, type PublisherConfig } from './config'
import { publicationDay } from './calendar'
import { publishArchive } from './run'

type SchedulerDependencies = {
  load: () => PublisherConfig,
  publish: (config: PublisherConfig, signal: AbortSignal) => Promise<unknown>,
  ready: (path: string) => Promise<string>,
  now: () => number,
  wait: (signal: AbortSignal) => Promise<unknown>
}

async function tokenVersion(path: string) {
  try {
    const file = await stat(path)
    if (file.isFile() && file.size > 0) { return String(file.mtimeMs) }
    return ''
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') { return '' }
    throw error
  }
}

export async function runPublisher(signal: AbortSignal, overrides: Partial<SchedulerDependencies> = {}) {
  console.log(JSON.stringify({ event: 'publisher_scheduler_started', checkSeconds: 60, retryMinutes: 30 }))
  const dependencies: SchedulerDependencies = {
    load: loadConfig, publish: publishArchive, ready: tokenVersion, now: Date.now,
    wait: function (signal) { return setTimeout(60000, undefined, { signal }) }, ...overrides
  }
  let completed = ''
  let nextAttempt = 0
  let lastConfiguration = ''
  while (!signal.aborted) {
    try {
      const config = dependencies.load()
      const token = await dependencies.ready(config.tokenFile)
      const configuration = JSON.stringify([config.enabled, config.repositoryName, config.branch, config.timezone, config.dailyTime, token])
      if (configuration !== lastConfiguration) {
        nextAttempt = 0
        lastConfiguration = configuration
      }
      const due = configuration + '|' + publicationDay(new Date(dependencies.now()), config.timezone, config.dailyTime)
      if (config.enabled && token && due !== completed && dependencies.now() >= nextAttempt) {
        const result = await dependencies.publish(config, signal)
        completed = due
        console.log(JSON.stringify({ event: 'publisher_checked', result }))
      }
    } catch (error) {
      if (!signal.aborted) {
        nextAttempt = dependencies.now() + 30 * 60000
        let message = 'Unexpected publisher error'
        if (error instanceof Error) { message = error.message }
        console.error(JSON.stringify({ event: 'publisher_failed', retryMinutes: 30, error: message }))
      }
    }
    try { await dependencies.wait(signal) } catch (error) {
      if (!signal.aborted) { throw error }
    }
  }
}

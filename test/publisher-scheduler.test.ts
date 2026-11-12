import { expect, test } from 'bun:test'
import { runPublisher } from '../src/publish/scheduler'
import type { PublisherConfig } from '../src/publish/config'

test('main-process scheduler retries a failed publication without overlapping or escaping into the consumer', async function () {
  const controller = new AbortController()
  let now = Date.parse('2026-11-12T00:00:00Z')
  let attempts = 0
  let waits = 0
  const config: PublisherConfig = {
    enabled: true, archiveDirectory: '/unused', repositoryName: 'archive', branch: 'main',
    tokenFile: '/unused-token', stateDirectory: '/unused-state', timezone: 'Asia/Shanghai', dailyTime: '03:15'
  }
  await runPublisher(controller.signal, {
    load: function () { return config }, ready: async function () { return 'token-version' }, now: function () { return now },
    publish: async function () {
      attempts += 1
      if (attempts === 1) { throw new Error('simulated offline GitHub') }
      return { state: 'succeeded' }
    },
    wait: async function () {
      waits += 1
      now += 10 * 60000
      if (waits >= 5) { controller.abort() }
    }
  })
  expect(attempts).toBe(2)
  expect(waits).toBe(5)
})

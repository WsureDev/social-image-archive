import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dailyRecords, alreadyPublished, frozenMonth, writeState } from '../src/publish/state'

test('a persisted daily snapshot survives retries and advances only on the next publication day', async function () {
  const directory = await mkdtemp(join(tmpdir(), 'publisher-recovery-'))
  let sourceReads = 0
  function readSource() {
    sourceReads += 1
    return []
  }
  try {
    await dailyRecords(directory, 'repo|main', '2026-11-12', readSource)
    await dailyRecords(directory, 'repo|main', '2026-11-12', readSource)
    expect(sourceReads).toBe(1)
    expect(await alreadyPublished(directory, 'repo|main', '2026-11-12')).toBe(false)
    await writeState(directory, { state: 'succeeded', configKey: 'repo|main', publicationDate: '2026-11-12' })
    expect(await alreadyPublished(directory, 'repo|main', '2026-11-12')).toBe(true)
    expect(await alreadyPublished(directory, 'other-repo|main', '2026-11-12')).toBe(false)
    await dailyRecords(directory, 'repo|main', '2026-11-13', readSource)
    expect(sourceReads).toBe(2)
    const original = { month: '2026-10', content: '{}\n', records: 1, commit: 'first-commit', timezone: 'Asia/Shanghai' }
    await frozenMonth(directory, 'repo|main', original)
    const recovered = await frozenMonth(directory, 'repo|main', { ...original, content: '', records: 0, commit: 'later-commit' })
    expect(recovered).toEqual(original)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

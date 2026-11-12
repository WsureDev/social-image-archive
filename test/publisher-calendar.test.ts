import { expect, test } from 'bun:test'
import { completedMonths, dateKey, publicationDay, weekKey } from '../src/publish/calendar'
import { buildSnapshot, SharedRecordSchema } from '../src/publish/records'

test('ISO weeks use archive-local dates across year and timezone boundaries', function () {
  expect(weekKey('2021-01-03T15:59:59Z', 'Asia/Shanghai')).toBe('2020-W53')
  expect(weekKey('2021-01-03T16:00:00Z', 'Asia/Shanghai')).toBe('2021-W01')
  expect(dateKey(new Date('2026-10-31T16:00:00Z'), 'Asia/Shanghai')).toBe('2026-11-01')
  expect(publicationDay(new Date('2026-11-11T19:14:59Z'), 'Asia/Shanghai', '03:15')).toBe('2026-11-11')
  expect(publicationDay(new Date('2026-11-11T19:15:00Z'), 'Asia/Shanghai', '03:15')).toBe('2026-11-12')
  expect(completedMonths('2025-12', '2026-03')).toEqual(['2025-12', '2026-01', '2026-02'])
  const beforeFirstRun = publicationDay(new Date('2026-10-31T18:00:00Z'), 'Asia/Shanghai', '03:15')
  expect(beforeFirstRun).toBe('2026-10-31')
  expect(completedMonths('2026-10', beforeFirstRun.slice(0, 7))).toEqual([])
})

export function sampleRecord() {
  return SharedRecordSchema.parse({
    id: 'a'.repeat(64), platform: 'example', imageUrl: 'https://example.org/original.jpg',
    tags: ['test'], author: { id: 'author', name: 'Author', token: 'private' },
    publishedAt: '2020-01-01T00:00:00Z', archivedAt: '2026-11-12T00:00:00Z',
    filename: '/srv/archive/private.jpg', referer: 'http://192.0.2.10/', thumbnail: 'private'
  })
}

test('weekly publication uses archive date and strips private fields', function () {
  const snapshot = buildSnapshot([sampleRecord()], '2026-11-12', 'Asia/Shanghai')
  const content = snapshot.files.get('weeks/2026-W46.jsonl')!
  expect(content).toContain('2020-01-01')
  expect(content).not.toContain('/mnt/storage')
  expect(content).not.toContain('192.0.2.10')
  expect(content).not.toContain('private')
  expect(snapshot.manifest.records).toBe(1)
  expect(buildSnapshot([], '2026-11-13', 'Asia/Shanghai').manifest.weeks).toEqual([])
})

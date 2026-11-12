import { expect, test } from 'bun:test'
import { resolvePolicy, pickCount } from '../src/mcp/policy'
import { PickInputSchema, prepareSelection, encodeCursor } from '../src/mcp/selection'

const settings = { defaultMaxPick: 3, trustProxy: false }

function request(host: string, maxPick?: string) {
  const headers = new Headers({ host })
  if (maxPick !== undefined) {
    headers.set('X-Archive-Max-Pick', maxPick)
  }
  return new Request('http://127.0.0.1:19280/mcp', { headers })
}

test('request origin distinguishes IP, domain and internal names without losing ports', function () {
  for (const [host, kind, origin] of [
    ['192.0.2.10:19280', 'ipv4', 'http://192.0.2.10:19280'],
    ['[::1]:19280', 'ipv6', 'http://[::1]:19280'],
    ['Photos.Example.com', 'domain', 'http://photos.example.com'],
    ['host.docker.internal:19280', 'docker-internal', 'http://host.docker.internal:19280'],
    ['social-image-archive:19280', 'internal-name', 'http://social-image-archive:19280']
  ]) {
    const policy = resolvePolicy(request(host), settings)
    expect(policy.hostKind).toBe(kind)
    expect(policy.origin).toBe(origin)
  }
})

test('forwarded origin is used only when proxy handling is enabled', function () {
  const input = new Request('http://127.0.0.1:19280/mcp', {
    headers: { host: '127.0.0.1:19280', 'x-forwarded-host': 'photos.example.com', 'x-forwarded-proto': 'https' }
  })
  expect(resolvePolicy(input, settings).origin).toBe('http://127.0.0.1:19280')
  expect(resolvePolicy(input, { ...settings, trustProxy: true }).origin).toBe('https://photos.example.com')
  const forwarded = new Request(input, { headers: { host: '127.0.0.1:19280', forwarded: 'for=10.0.0.1;host="[2001:db8::1]:8443";proto=https' } })
  expect(resolvePolicy(forwarded, { ...settings, trustProxy: true }).origin).toBe('https://[2001:db8::1]:8443')
})

test('header config is isolated per request and excessive counts are silently capped', function () {
  const first = resolvePolicy(request('archive', '2'), settings)
  const second = resolvePolicy(request('archive', '7'), settings)
  expect(pickCount(1000, first.maxPick)).toBe(2)
  expect(pickCount(undefined, first.maxPick)).toBe(2)
  expect(pickCount(1, second.maxPick)).toBe(1)
  expect(resolvePolicy(request('archive'), settings).maxPick).toBe(3)
  for (const invalid of ['0', '-1', '2.5', 'Infinity', '2, 7', '']) {
    expect(function () { resolvePolicy(request('archive', invalid), settings) }).toThrow()
  }
})

test('cursor preserves selection but uses the next request maxPick and new batch size', function () {
  const first = prepareSelection(PickInputSchema.parse({ count: 100, filters: { tags: { all: ['风景'] } } }), 2)
  expect(first.query.limit).toBe(2)
  const cursor = encodeCursor(first.selection, 2)
  const next = prepareSelection(PickInputSchema.parse({ cursor, count: 100 }), 1)
  expect(next.query.limit).toBe(1)
  expect(next.query.offset).toBe(2)
  expect(next.query.seed).toBe(first.query.seed)
  expect(next.query.until).toBe(first.query.until)
  expect(next.query.tags.all).toEqual(['风景'])
  expect(first.selection).not.toHaveProperty('maxPick')
})

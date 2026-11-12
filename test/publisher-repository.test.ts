import { expect, test } from 'bun:test'
import { ensureRepository } from '../src/publish/repository'

test('repository owner comes from token account and a missing public repository is created', async function () {
  let created = false
  const github = await ensureRepository('fake-token', 'custom-jsonl-archive', async function (url, init) {
    if (url.endsWith('/user')) {
      return Response.json({ login: 'actual-owner' })
    }
    if (url.endsWith('/user/repos')) {
      const body = JSON.parse(String(init.body))
      expect(body.name).toBe('custom-jsonl-archive')
      expect(body.private).toBe(false)
      expect(init.method).toBe('POST')
      created = true
      return Response.json({ full_name: 'actual-owner/custom-jsonl-archive', private: false })
    }
    expect(url).toBe('https://api.github.com/repos/actual-owner/custom-jsonl-archive')
    return Response.json({}, { status: 404 })
  })
  expect(created).toBe(true)
  expect(github.repository).toBe('actual-owner/custom-jsonl-archive')
})

test('retry reuses an existing repository without recreating it', async function () {
  const github = await ensureRepository('fake-token', 'archive', async function (url, init) {
    expect(init.method).toBe('GET')
    if (url.endsWith('/user')) { return Response.json({ login: 'owner' }) }
    return Response.json({ full_name: 'owner/archive', private: false })
  })
  expect(github.repository).toBe('owner/archive')
})

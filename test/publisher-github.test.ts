import { expect, test } from 'bun:test'
import { GitHub } from '../src/publish/github'
import { sha256 } from '../src/publish/records'
import { publishMonth } from '../src/publish/release'

test('release upload failure keeps draft; retry uploads JSONL and verifies before publishing', async function () {
  const content = '{}\n'
  const digest = 'sha256:' + sha256(content)
  let draft = true
  let uploaded = false
  let failUpload = true
  let created = 0
  const asset = { id: 2, name: '2026-10.jsonl', size: 3, state: 'uploaded', digest }
  function release() { return { id: 1, tag_name: 'archive-2026-10', draft, html_url: 'https://github.com/owner/repo/releases/tag/archive-2026-10', assets: [] as typeof asset[] } }
  const github = new GitHub('owner/repo', 'fake-token', async function (url, init) {
    if (url.includes('uploads.github.com')) {
      expect(init.body).toBe(content)
      if (failUpload) { return new Response('', { status: 503 }) }
      uploaded = true
      return Response.json(asset)
    }
    if (init.method === 'POST') { created += 1 }
    if (init.method === 'PATCH') {
      expect(uploaded).toBe(true)
      draft = false
    }
    const value = release()
    if (uploaded) { value.assets.push(asset) }
    return Response.json(value)
  })
  await expect(publishMonth(github, '2026-10', content, 1, 'head', 'Asia/Shanghai')).rejects.toThrow('503')
  expect(draft).toBe(true)
  failUpload = false
  expect((await publishMonth(github, '2026-10', content, 1, 'head', 'Asia/Shanghai')).created).toBe(true)
  expect(created).toBe(0)
  expect((await publishMonth(github, '2026-10', 'changed\n', 2, 'new-head', 'Asia/Shanghai')).created).toBe(false)
})

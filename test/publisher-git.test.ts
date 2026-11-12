import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { commitSnapshot } from '../src/publish/commit'
import { Git } from '../src/publish/git'

test('fetch/pull preserves a remote README edit, removes stale weeks and recovers without duplicate commits', async function () {
  const directory = await mkdtemp(join(tmpdir(), 'publisher-git-'))
  const bare = join(directory, 'remote.git')
  const publisher = join(directory, 'publisher')
  const editor = join(directory, 'editor')
  const root = new Git(directory, 'fake-token')
  try {
    await root.execute(['init', '--bare', bare])
    const firstFiles = new Map([['manifest.json', '{"day":1}\n'], ['weeks/2026-W45.jsonl', '{}\n']])
    const first = await commitSnapshot({ repository: 'owner/archive', token: 'fake-token', branch: 'main', files: firstFiles, day: '2026-11-12', directory: publisher, remote: bare })
    expect(first.changed).toBe(true)
    await root.execute(['clone', '--branch', 'main', bare, editor])
    const user = new Git(editor, 'fake-token')
    await user.execute(['config', 'user.name', 'User'])
    await user.execute(['config', 'user.email', 'user@example.org'])
    const readme = '# 用户文档 / User documentation\nKeep this edit.\n'
    await writeFile(join(editor, 'README.md'), readme)
    await user.execute(['add', 'README.md'])
    await user.execute(['commit', '-m', 'User README update'])
    await user.execute(['push', 'origin', 'main'])
    const nextFiles = new Map([['manifest.json', '{"day":2}\n'], ['weeks/2026-W46.jsonl', '{"new":true}\n']])
    const next = await commitSnapshot({ repository: 'owner/archive', token: 'fake-token', branch: 'main', files: nextFiles, day: '2026-11-13', directory: publisher, remote: bare })
    expect(next.changed).toBe(true)
    expect(await readFile(join(publisher, 'README.md'), 'utf8')).toBe(readme)
    await expect(readFile(join(publisher, 'weeks/2026-W45.jsonl'))).rejects.toThrow()
    const retry = await commitSnapshot({ repository: 'owner/archive', token: 'fake-token', branch: 'main', files: nextFiles, day: '2026-11-13', directory: publisher, remote: bare })
    expect(retry).toEqual({ changed: false, sha: next.sha })
    const log = await new Git(publisher, 'fake-token').execute(['log', '--format=%s'])
    expect(log.stdout).toContain('User README update')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

import { readFileSync } from 'node:fs'
import { readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Git, managedDirectory, regularFile } from './git'

export const ShareReadme = readFileSync(new URL('../../share-template/README.md', import.meta.url), 'utf8')
const WeekPath = /^weeks\/\d{4}-W\d{2}\.jsonl$/

export async function commitSnapshot(options: {
  repository: string, token: string, branch: string, files: Map<string, string>,
  day: string, directory: string, remote?: string, signal?: AbortSignal
}) {
  const { repository, token, branch, day, directory, signal } = options
  let remote = 'https://github.com/' + repository + '.git'
  if (options.remote) { remote = options.remote }
  await managedDirectory(directory)
  const git = new Git(directory, token, signal)
  await git.execute(['check-ref-format', '--branch', branch])
  await git.execute(['init', '--initial-branch=' + branch])
  const currentRemote = await git.execute(['remote', 'get-url', 'origin'], [0, 2])
  if (currentRemote.code === 2) {
    await git.execute(['remote', 'add', 'origin', remote])
  } else if (currentRemote.stdout !== remote) {
    throw new Error('Publisher checkout points at another remote')
  }
  await git.execute(['config', 'user.name', 'image archive publisher'])
  await git.execute(['config', 'user.email', 'image-archive@localhost'])
  // Fetch and pull happen before every new commit/push, including a retry.
  await git.execute(['fetch', '--prune', 'origin'])
  const hasRemote = await git.execute(['show-ref', '--verify', '--quiet', 'refs/remotes/origin/' + branch], [0, 1])
  const hasHead = await git.execute(['rev-parse', '--verify', 'HEAD'], [0, 128])
  if (hasRemote.code === 0) {
    if (hasHead.code !== 0) {
      await git.execute(['checkout', '-B', branch, 'refs/remotes/origin/' + branch])
    }
    await git.execute(['pull', '--rebase', '--autostash', 'origin', branch])
  } else {
    const heads = await git.execute(['ls-remote', '--heads', 'origin'])
    if (heads.stdout) { throw new Error('Configured branch does not exist in the nonempty destination repository') }
  }
  const files = new Map(options.files)
  if (!await regularFile(join(directory, 'README.md'))) { files.set('README.md', ShareReadme) }
  await managedDirectory(join(directory, 'weeks'))
  const tracked = new Set((await git.execute(['ls-files', '-z'])).stdout.split('\0'))
  const stage = new Set<string>()
  for (const [path, content] of files) {
    if (path !== 'README.md' && path !== 'manifest.json' && !WeekPath.test(path)) {
      throw new Error('Refusing an unmanaged publish path: ' + path)
    }
    if (Buffer.byteLength(content) > 90 * 1024 * 1024) { throw new Error('Managed file exceeds 90 MiB: ' + path) }
    await regularFile(join(directory, path))
    await writeFile(join(directory, path), content)
    stage.add(path)
  }
  for (const name of await readdir(join(directory, 'weeks'))) {
    const path = 'weeks/' + name
    if (WeekPath.test(path) && !files.has(path)) {
      await regularFile(join(directory, path))
      await unlink(join(directory, path))
      if (tracked.has(path)) { stage.add(path) }
    }
  }
  await git.execute(['add', '-A', '--', ...stage])
  const staged = await git.execute(['diff', '--cached', '--name-only'])
  for (const path of staged.stdout.split('\n').filter(Boolean)) {
    if (path !== 'README.md' && path !== 'manifest.json' && !WeekPath.test(path)) { throw new Error('Unmanaged file is staged: ' + path) }
  }
  const changed = staged.stdout.length > 0
  if (changed) { await git.execute(['commit', '-m', 'Archive metadata ' + day]) }
  await git.execute(['push', 'origin', 'HEAD:refs/heads/' + branch])
  const sha = (await git.execute(['rev-parse', 'HEAD'])).stdout
  const verified = await git.execute(['ls-remote', 'origin', 'refs/heads/' + branch])
  if (verified.stdout.split(/\s/)[0] !== sha) { throw new Error('Remote head changed during publication') }
  return { sha, changed }
}

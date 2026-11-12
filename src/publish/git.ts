import { mkdir, lstat } from 'node:fs/promises'

export class Git {
  private environment: Record<string, string | undefined>
  private authorization: string

  constructor(private directory: string, private token: string, private signal?: AbortSignal) {
    this.authorization = Buffer.from('x-access-token:' + token).toString('base64')
    this.environment = {
      ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/bin/false',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: 'Authorization: Basic ' + this.authorization,
      GIT_CONFIG_KEY_1: 'core.hooksPath', GIT_CONFIG_VALUE_1: '/dev/null'
    }
  }

  async execute(args: string[], accepted = [0]) {
    this.signal?.throwIfAborted()
    const child = Bun.spawn(['git', ...args], {
      cwd: this.directory, env: this.environment, stdout: 'pipe', stderr: 'pipe', stdin: 'ignore'
    })
    function stop() { child.kill() }
    this.signal?.addEventListener('abort', stop, { once: true })
    try {
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited
      ])
      this.signal?.throwIfAborted()
      if (!accepted.includes(code)) {
        const safe = stderr.replaceAll(this.token, '[redacted]').replaceAll(this.authorization, '[redacted]')
        throw new Error('git ' + args[0] + ' failed (' + code + '): ' + safe.trim())
      }
      return { stdout: stdout.trim(), code }
    } finally {
      this.signal?.removeEventListener('abort', stop)
    }
  }
}

export async function regularFile(path: string) {
  try {
    const entry = await lstat(path)
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error('Refusing a non-regular managed file: ' + path)
    }
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') { return false }
    throw error
  }
}

export async function managedDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 })
  const entry = await lstat(path)
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error('Refusing a non-directory managed path: ' + path)
  }
}

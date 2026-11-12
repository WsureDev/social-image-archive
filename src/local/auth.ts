import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const CredentialSchema = z.object({
  type: z.enum(['oauth', 'api_token']),
  token: z.string().min(1)
})

export function createQueueAuth(apiToken: string) {
  let cachedToken = ''
  let cachedAt = 0

  async function token() {
    if (apiToken) {
      return apiToken
    }
    if (cachedToken && Date.now() - cachedAt < 5 * 60_000) {
      return cachedToken
    }
    const cli = fileURLToPath(new URL('../../node_modules/wrangler/bin/wrangler.js', import.meta.url))
    const child = Bun.spawn([process.execPath, cli, 'auth', 'token', '--json'], {
      stdout: 'pipe', stderr: 'ignore', timeout: 30_000,
      env: {
        ...process.env,
        WRANGLER_LOG: 'error',
        WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH || fileURLToPath(new URL('../../.wrangler/auth.log', import.meta.url)),
        WRANGLER_SEND_METRICS: 'false'
      }
    })
    const output = await new Response(child.stdout).text()
    if (await child.exited !== 0) {
      throw new Error('Cloudflare login unavailable. Run wrangler login or set CLOUDFLARE_API_TOKEN')
    }
    const credential = CredentialSchema.safeParse(JSON.parse(output))
    if (!credential.success) {
      throw new Error('Wrangler did not return usable Cloudflare credentials')
    }
    cachedToken = credential.data.token
    cachedAt = Date.now()
    return cachedToken
  }

  function invalidate() {
    cachedToken = ''
    cachedAt = 0
  }

  return { token, invalidate }
}

import { z } from 'zod'

export const ReleaseSchema = z.object({
  id: z.number(), tag_name: z.string(), draft: z.boolean(), html_url: z.string(),
  assets: z.array(z.object({ id: z.number(), name: z.string(), size: z.number(), state: z.string(), digest: z.string().nullable().optional() }))
})

export class GitHubError extends Error {
  constructor(readonly status: number, method: string, path: string) {
    super('GitHub ' + method + ' ' + path + ' returned HTTP ' + status)
  }
}

export type RequestTransport = (url: string, init: RequestInit) => Promise<Response>

export class GitHub {
  constructor(readonly repository: string, private token: string, private transport: RequestTransport = fetch, private signal?: AbortSignal) {}

  private timeout(milliseconds: number) {
    const timeout = AbortSignal.timeout(milliseconds)
    if (this.signal) { return AbortSignal.any([this.signal, timeout]) }
    return timeout
  }

  async request<T>(method: string, path: string, schema: z.ZodType<T>, body?: object) {
    return this.requestUrl(method, 'https://api.github.com/repos/' + this.repository + path, path, schema, body)
  }

  async accountRequest<T>(method: string, path: string, schema: z.ZodType<T>, body?: object) {
    return this.requestUrl(method, 'https://api.github.com' + path, path, schema, body)
  }

  private async requestUrl<T>(method: string, url: string, path: string, schema: z.ZodType<T>, body?: object) {
    const response = await this.send(method, url, body)
    if (!response.ok) {
      throw new GitHubError(response.status, method, path)
    }
    if (response.status === 204) {
      return schema.parse(null)
    }
    return schema.parse(await response.json())
  }

  async optional<T>(path: string, schema: z.ZodType<T>) {
    try {
      return await this.request('GET', path, schema)
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  private send(method: string, url: string, body?: object) {
    const headers = {
      Authorization: 'Bearer ' + this.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
      'Content-Type': 'application/json'
    }
    const init: RequestInit = { method, headers, signal: this.timeout(60000), redirect: 'error' }
    if (body !== undefined) {
      init.body = JSON.stringify(body)
    }
    return this.transport(url, init)
  }

  async upload(releaseId: number, filename: string, content: string) {
    const url = 'https://uploads.github.com/repos/' + this.repository + '/releases/' + releaseId + '/assets?name=' + encodeURIComponent(filename)
    const response = await this.transport(url, {
      method: 'POST', redirect: 'error', signal: this.timeout(120000),
      headers: { Authorization: 'Bearer ' + this.token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/x-ndjson', 'X-GitHub-Api-Version': '2026-03-10' },
      body: content
    })
    if (!response.ok) {
      throw new GitHubError(response.status, 'POST', '/releases/' + releaseId + '/assets')
    }
    return z.object({ id: z.number(), name: z.string(), size: z.number(), state: z.string(), digest: z.string().nullable().optional() }).parse(await response.json())
  }
}

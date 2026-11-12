import { z } from 'zod'
import { GitHub, type RequestTransport } from './github'

const AccountSchema = z.object({ login: z.string().regex(/^[A-Za-z0-9-]+$/) })
const RepositorySchema = z.object({ full_name: z.string(), private: z.boolean() })

export async function ensureRepository(token: string, name: string, transport?: RequestTransport, signal?: AbortSignal) {
  const account = new GitHub('', token, transport, signal)
  const user = await account.accountRequest('GET', '/user', AccountSchema)
  const repository = user.login + '/' + name
  const github = new GitHub(repository, token, transport, signal)
  let remote = await github.optional('', RepositorySchema)
  if (!remote) {
    remote = await account.accountRequest('POST', '/user/repos', RepositorySchema, {
      name, private: false, auto_init: false, has_issues: false, has_wiki: false,
      description: 'Weekly image-source JSONL metadata and monthly metadata Releases. No image files.'
    })
  }
  if (remote.full_name.toLowerCase() !== repository.toLowerCase() || remote.private) {
    throw new Error('Expected the configured public repository owned by the authenticated account')
  }
  return github
}

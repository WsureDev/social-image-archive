import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { z } from 'zod'

const ConfigSchema = z.object({
  SHARE_ENABLED: z.enum(['true', 'false']).default('true'),
  ARCHIVE_DIR: z.string().default('./data-docker'),
  SHARE_REPO_NAME: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/).default('x-image-archive'),
  SHARE_BRANCH: z.string().min(1).default('main'),
  SHARE_TOKEN_FILE: z.string().default('./.secrets/github-token'),
  SHARE_STATE_DIR: z.string().default('./publisher-state'),
  SHARE_TIMEZONE: z.string().default('Asia/Shanghai').refine(function (value) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value })
      return true
    } catch {
      return false
    }
  }, 'Invalid timezone'),
  SHARE_DAILY_TIME: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).default('03:15')
})

const FileConfigSchema = z.object({
  enabled: z.boolean().optional(),
  repositoryName: ConfigSchema.shape.SHARE_REPO_NAME.optional(),
  branch: ConfigSchema.shape.SHARE_BRANCH.optional(),
  timezone: ConfigSchema.shape.SHARE_TIMEZONE.optional(),
  dailyTime: ConfigSchema.shape.SHARE_DAILY_TIME.optional()
}).strict()

export function loadConfig() {
  const config = ConfigSchema.parse(process.env)
  let file = FileConfigSchema.parse({})
  try {
    file = FileConfigSchema.parse(JSON.parse(readFileSync(process.env.SHARE_CONFIG_FILE ?? './publisher.config.json', 'utf8')))
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') { throw error }
  }
  return {
    enabled: file.enabled ?? config.SHARE_ENABLED === 'true',
    archiveDirectory: resolve(config.ARCHIVE_DIR),
    repositoryName: file.repositoryName ?? config.SHARE_REPO_NAME,
    branch: file.branch ?? config.SHARE_BRANCH,
    tokenFile: resolve(config.SHARE_TOKEN_FILE),
    stateDirectory: resolve(config.SHARE_STATE_DIR),
    timezone: file.timezone ?? config.SHARE_TIMEZONE,
    dailyTime: file.dailyTime ?? config.SHARE_DAILY_TIME
  }
}
export type PublisherConfig = ReturnType<typeof loadConfig>

export async function readToken(path: string) {
  const metadata = await stat(path)
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) {
    throw new Error('Token must be a regular file with no group/other permissions (use chmod 600)')
  }
  const token = (await readFile(path, 'utf8')).trim()
  if (!token || /\s/.test(token)) {
    throw new Error('Token file must contain one nonempty token')
  }
  return token
}

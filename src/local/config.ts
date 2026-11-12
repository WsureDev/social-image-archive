import { resolve } from 'node:path'
import { z } from 'zod'

const ConfigSchema = z.object({
  QUEUE_WORKER_URL: z.url().default('http://127.0.0.1:8787'),
  CF_ACCOUNT_ID: z.string().default(''),
  CF_QUEUE_ID: z.string().default(''),
  CLOUDFLARE_API_TOKEN: z.string().default(''),
  ARCHIVE_DIR: z.string().default('./data'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(19280),
  MCP_MAX_PICK: z.coerce.number().int().positive().safe().default(3),
  MCP_TRUST_PROXY: z.enum(['true', 'false']).default('false').transform(function (value) { return value === 'true' }),
  POLL_SECONDS: z.coerce.number().int().min(5).max(3600).default(60)
})

export const config = ConfigSchema.parse(process.env)
export const archiveDir = resolve(config.ARCHIVE_DIR)

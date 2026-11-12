import { isIP } from 'node:net'
import { z } from 'zod'

const HeaderMaxPickSchema = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive().safe())
const ProtocolSchema = z.enum(['http', 'https'])
const OriginSchema = z.url().transform(function (value) { return new URL(value) }).refine(function (url) {
  return !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash
}, 'Invalid request host')

export interface McpSettings {
  defaultMaxPick: number
  trustProxy: boolean
}

export type RequestPolicy = ReturnType<typeof resolvePolicy>

export function resolvePolicy(request: Request, settings: McpSettings) {
  const url = new URL(request.url)
  let host = request.headers.get('host') || url.host
  let protocol = url.protocol.replace(':', '')
  let maxPick = settings.defaultMaxPick
  const configured = request.headers.get('x-archive-max-pick')
  if (configured !== null) {
    maxPick = HeaderMaxPickSchema.parse(configured)
  }
  if (settings.trustProxy) {
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0].trim()
    const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim()
    if (forwardedHost) {
      host = forwardedHost
    }
    if (forwardedProtocol) {
      protocol = forwardedProtocol
    }
    const forwarded = request.headers.get('forwarded')?.split(',')[0]
    if (forwarded) {
      for (const field of forwarded.split(';')) {
        const separator = field.indexOf('=')
        const key = field.slice(0, separator).trim().toLowerCase()
        const value = field.slice(separator + 1).trim().replace(/^"|"$/g, '')
        if (key === 'host') {
          host = value
        }
        if (key === 'proto') {
          protocol = value
        }
      }
    }
  }
  const origin = OriginSchema.parse(ProtocolSchema.parse(protocol) + '://' + host).origin
  const hostname = new URL(origin).hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  let hostKind = 'domain'
  const ipVersion = isIP(hostname)
  if (ipVersion === 4) {
    hostKind = 'ipv4'
  } else if (ipVersion === 6) {
    hostKind = 'ipv6'
  } else if (hostname.endsWith('.docker.internal') || hostname === 'docker.internal') {
    hostKind = 'docker-internal'
  } else if (!hostname.includes('.')) {
    hostKind = 'internal-name'
  }
  return { origin, hostname, hostKind, maxPick }
}

export function pickCount(requested: number | undefined, maxPick: number) {
  if (requested === undefined) {
    return maxPick
  }
  return Math.min(requested, maxPick)
}

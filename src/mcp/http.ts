import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import type { Archive } from '../local/archive'
import type { ImageSizeReader } from './images'
import { resolvePolicy, type McpSettings } from './policy'
import { createArchiveMcp } from './server'

export function createMcpHandler(archive: Archive, readSize: ImageSizeReader, directory: string, settings: McpSettings) {
  return async function handleMcp(request: Request) {
    if (request.method !== 'POST') {
      return Response.json({ jsonrpc: '2.0', error: { code: -32000, message: 'Use POST for stateless MCP' }, id: null }, {
        status: 405, headers: { allow: 'POST' }
      })
    }
    let policy: ReturnType<typeof resolvePolicy>
    try {
      policy = resolvePolicy(request, settings)
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof TypeError) {
        return Response.json({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid X-Archive-Max-Pick header or request origin' }, id: null }, { status: 400 })
      }
      throw error
    }
    const server = createArchiveMcp(archive, readSize, directory, policy)
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
    try {
      await server.connect(transport)
      const response = await transport.handleRequest(request)
      const body = await response.arrayBuffer()
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
    } finally {
      await server.close()
    }
  }
}

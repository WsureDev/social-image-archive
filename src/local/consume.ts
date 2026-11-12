import { setTimeout } from 'node:timers/promises'
import { ImageMessageSchema, ClaimResponseSchema, messageId } from '../message'
import { openArchive } from './archive'
import { archiveDir, config } from './config'
import { archiveImage } from './download'
import { acknowledge, cloudRequest, pull } from './queue'
import { createShutdownSignal } from './shutdown'

async function consumeOverflow(archive: ReturnType<typeof openArchive>) {
  const { job } = ClaimResponseSchema.parse(await cloudRequest('/v1/claim', {}))
  if (!job) {
    return false
  }
  try {
    await archiveImage(job.id, job.message, archive, archiveDir)
  } catch (error) {
    await cloudRequest('/v1/jobs/' + job.id + '/fail', { leaseToken: job.leaseToken, error: String(error).slice(0, 1000) })
    console.error(JSON.stringify({ event: 'overflow_download_failed', id: job.id, error: String(error) }))
    return true
  }
  await cloudRequest('/v1/completed/' + job.id, {})
  console.log(JSON.stringify({ event: 'archived', source: 'd1', id: job.id }))
  return true
}

export async function consume(signal: AbortSignal) {
  const archive = openArchive(archiveDir)
  console.log(JSON.stringify({ event: 'consumer_started', archiveDir }))
  while (!signal.aborted) {
    let busy = false
    try {
      for (const item of await pull()) {
        const message = ImageMessageSchema.parse(JSON.parse(item.body))
        const id = await messageId(message)
        await archiveImage(id, message, archive, archiveDir)
        await cloudRequest('/v1/completed/' + id, {})
        await acknowledge(item.lease_id)
        console.log(JSON.stringify({ event: 'archived', source: 'queue', id }))
        busy = true
      }
    } catch (error) {
      console.error(JSON.stringify({ event: 'queue_consume_failed', error: String(error) }))
    }
    if (signal.aborted) {
      break
    }
    try {
      if (await consumeOverflow(archive)) {
        busy = true
      }
    } catch (error) {
      console.error(JSON.stringify({ event: 'overflow_consume_failed', error: String(error) }))
    }
    let delay = config.POLL_SECONDS * 1000
    if (busy) {
      delay = 1000
    }
    try {
      await setTimeout(delay, undefined, { signal })
    } catch (error) {
      if (!signal.aborted) {
        throw error
      }
    }
  }
}

if (import.meta.main) {
  await consume(createShutdownSignal())
}

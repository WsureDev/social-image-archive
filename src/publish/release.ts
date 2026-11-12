import { z } from 'zod'
import { GitHub, ReleaseSchema } from './github'
import { sha256 } from './records'

export async function publishMonth(github: GitHub, month: string, content: string, records: number, commit: string, timezone: string) {
  const tag = 'archive-' + month
  const path = '/releases/tags/' + encodeURIComponent(tag)
  let release = await github.optional(path, ReleaseSchema)
  const name = month + '.jsonl'
  if (release && !release.draft) {
    if (!release.assets.some(function (asset) { return asset.name === name && asset.state === 'uploaded' })) {
      throw new Error('Published release is missing its JSONL asset; manual review required: ' + tag)
    }
    return { month, url: release.html_url, created: false }
  }
  const digest = 'sha256:' + sha256(content)
  const body = [
    'Archive month: ' + month + ' (' + timezone + ')', 'Records: ' + records,
    'Source commit: ' + commit, 'SHA-256: ' + digest.slice(7),
    'Source links and metadata only. No image files. This is a historical snapshot.'
  ].join('\n\n')
  if (!release) {
    release = await github.request('POST', '/releases', ReleaseSchema, {
      tag_name: tag, target_commitish: commit, name: 'Metadata archive ' + month,
      body, draft: true, prerelease: false
    })
  }
  let asset = release.assets.find(function (item) { return item.name === name })
  if (asset && (asset.state !== 'uploaded' || asset.size !== Buffer.byteLength(content) || asset.digest !== digest)) {
    await github.request('DELETE', '/releases/assets/' + asset.id, z.null())
    asset = undefined
  }
  if (!asset) {
    asset = await github.upload(release.id, name, content)
  }
  if (asset.name !== name || asset.state !== 'uploaded' || asset.size !== Buffer.byteLength(content) || asset.digest !== digest) {
    throw new Error('Release JSONL checksum/size verification failed: ' + tag)
  }
  await github.request('PATCH', '/releases/' + release.id, ReleaseSchema, { body, draft: false, make_latest: 'false' })
  const verified = await github.request('GET', path, ReleaseSchema)
  if (verified.draft || !verified.assets.some(function (item) { return item.name === name && item.digest === digest && item.state === 'uploaded' })) {
    throw new Error('Release verification failed: ' + tag)
  }
  return { month, url: verified.html_url, created: true }
}

import { mkdir, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { z } from 'zod'

export const ThumbnailParamsSchema = z.object({
  filename: z.string().regex(/^[a-f0-9]{64}\.(jpg|png|webp|gif|avif)$/)
})

sharp.concurrency(1)
sharp.cache({ memory: 32, files: 0, items: 32 })

export function createThumbnails(directory: string) {
  const cacheDir = join(directory, 'thumbnails')
  const dimensions = new Map<string, Promise<{ width: number, height: number }>>()
  const SizeSchema = z.object({ width: z.number().positive(), height: z.number().positive() })
  const pending = new Map<string, Promise<string | null>>()
  const waiting: (() => void)[] = []
  let active = 0

  async function render(filename: string, destination: string) {
    if (active >= 2) {
      await new Promise<void>(function (resolve) { waiting.push(resolve) })
    } else {
      active += 1
    }
    const temporary = destination + '.' + crypto.randomUUID() + '.partial'
    try {
      const source = join(directory, 'objects', filename)
      if (!await Bun.file(source).exists()) {
        return null
      }
      await mkdir(cacheDir, { recursive: true })
      await sharp(source)
        .rotate()
        .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(temporary)
      await rename(temporary, destination)
      return destination
    } finally {
      await unlink(temporary).catch(function () {})
      const next = waiting.shift()
      if (next) {
        next()
      } else {
        active -= 1
      }
    }
  }

  async function get(filename: string) {
    const destination = join(cacheDir, filename + '.webp')
    if (await Bun.file(destination).exists()) {
      return destination
    }
    const existing = pending.get(filename)
    if (existing) {
      return existing
    }
    const operation = render(filename, destination)
    pending.set(filename, operation)
    try {
      return await operation
    } finally {
      pending.delete(filename)
    }
  }

  async function size(filename: string) {
    const existing = dimensions.get(filename)
    if (existing) {
      return existing
    }
    const operation = sharp(join(directory, 'objects', filename)).metadata().then(function (metadata) {
      return SizeSchema.parse(metadata.autoOrient)
    })
    dimensions.set(filename, operation)
    try {
      return await operation
    } catch (error) {
      dimensions.delete(filename)
      throw error
    }
  }

  return { get, size }
}

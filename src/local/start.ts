import { startGallery } from './main'
import { consume } from './consume'
import { createShutdownController } from './shutdown'
import { runPublisher } from '../publish/scheduler'

const controller = createShutdownController()
const signal = controller.signal
const server = startGallery()
const publisher = runPublisher(signal).catch(function (error) {
  console.error(JSON.stringify({ event: 'publisher_stopped', error: String(error) }))
})

try {
  await consume(signal)
} finally {
  controller.abort()
  await publisher
  await server.stop(true)
}

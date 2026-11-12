import { messageId, type ImageMessage } from '../message'

type Producer = Pick<Queue<string>, 'send'>

export async function enqueueImage(message: ImageMessage, primary: Producer, timer: Producer) {
  const id = await messageId(message)
  const payload = JSON.stringify(message)
  await timer.send(payload, { contentType: 'text', delaySeconds: 18 * 3600 })
  await primary.send(payload, { contentType: 'text' })
  return id
}

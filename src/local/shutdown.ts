export function createShutdownController() {
  const controller = new AbortController()

  function shutdown() {
    controller.abort()
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  return controller
}

export function createShutdownSignal() {
  return createShutdownController().signal
}

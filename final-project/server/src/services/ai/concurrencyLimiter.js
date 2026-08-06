/**
 * Small reusable concurrency limiter (semaphore + FIFO queue).
 *
 * A queued task's function is not invoked until a slot is free, so any
 * work the task does on invocation (e.g. starting a request timeout timer)
 * only begins once it actually starts executing — not while it waits.
 */
export const createConcurrencyLimiter = (limit) => {
  const maxConcurrent = Math.max(1, Number(limit) || 1)
  let active = 0
  const queue = []

  const runNext = () => {
    if (active >= maxConcurrent || queue.length === 0) return

    active += 1
    const { fn, resolve, reject } = queue.shift()

    Promise.resolve()
      .then(fn)
      .then(
        (value) => {
          active -= 1
          resolve(value)
          runNext()
        },
        (error) => {
          active -= 1
          reject(error)
          runNext()
        },
      )
  }

  return {
    run(fn) {
      return new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject })
        runNext()
      })
    },
    get active() {
      return active
    },
    get pending() {
      return queue.length
    },
  }
}

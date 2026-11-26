let chain: Promise<unknown> = Promise.resolve()

export function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job)
  chain = run.catch(() => undefined)

  return run
}

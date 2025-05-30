// taken from https://stackoverflow.com/questions/47157428/how-to-implement-a-pseudo-blocking-async-queue-in-js-ts

export class AsyncBlockingQueue<T> {
  resolvers: ((value: T | PromiseLike<T>) => void)[]
  promises: Promise<T>[]
  constructor() {
    // invariant: at least one of the arrays is empty
    this.resolvers = []
    this.promises = []
  }
  _add(): void {
    this.promises.push(
      new Promise<T>((resolve) => {
        this.resolvers.push(resolve)
      })
    )
  }
  enqueue(t: T): void {
    // if (this.resolvers.length) this.resolvers.shift()(t);
    // else this.promises.push(Promise.resolve(t));
    if (!this.resolvers.length) this._add()

    /**@ts-expect-error list is not empty because of the above line */
    this.resolvers.shift()(t)
  }
  dequeue(): Promise<T> {
    if (!this.promises.length) this._add()
    return this.promises.shift() as Promise<T>
  }
  // now some utilities:
  isEmpty(): boolean {
    // there are no values available
    return !this.promises.length // this.length <= 0
  }
  isBlocked(): boolean {
    // it's waiting for values
    return !!this.resolvers.length // this.length < 0
  }
  get length(): number {
    return this.promises.length - this.resolvers.length
  }
  [Symbol.asyncIterator]() {
    // Todo: Use AsyncIterator.from()
    return {
      next: () => this.dequeue().then((value) => ({ done: false, value })),
      [Symbol.asyncIterator]() {
        return this
      }
    }
  }
}

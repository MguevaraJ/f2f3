import { availableParallelism } from 'node:os'
import { Worker } from 'node:worker_threads'
import type { WorkerJob, WorkerReply } from '../workers/protocol'
import { tr } from '@shared/i18n'

type Priority = 'high' | 'low'

interface Pending {
  job: WorkerJob
  resolve: (r: WorkerReply) => void
  reject: (e: Error) => void
}

/**
 * Fixed-size pool of analysis workers with two priority lanes: thumbnails the
 * user is looking at jump ahead of the background analysis queue.
 */
export class WorkerPool {
  private readonly idle: Worker[] = []
  private readonly busy = new Map<Worker, Pending>()
  private readonly lanes: Record<Priority, Pending[]> = { high: [], low: [] }
  private nextId = 1
  private disposed = false

  constructor(
    private readonly entry: URL,
    size = Math.max(1, Math.min(4, availableParallelism() - 1))
  ) {
    for (let i = 0; i < size; i++) this.idle.push(this.spawn())
  }

  run(job: Omit<WorkerJob, 'jobId'>, priority: Priority = 'low'): Promise<WorkerReply> {
    return new Promise((resolve, reject) => {
      this.lanes[priority].push({ job: { ...job, jobId: this.nextId++ }, resolve, reject })
      this.pump()
    })
  }

  get queued(): number {
    return this.lanes.high.length + this.lanes.low.length
  }

  async dispose(): Promise<void> {
    this.disposed = true
    const all = [...this.idle, ...this.busy.keys()]
    for (const p of [...this.lanes.high, ...this.lanes.low])
      p.reject(new Error(tr('Pool disposed')))
    await Promise.all(all.map((w) => w.terminate()))
  }

  private spawn(): Worker {
    const worker = new Worker(this.entry)
    worker.on('message', (reply: WorkerReply) => {
      const pending = this.busy.get(worker)
      this.busy.delete(worker)
      this.idle.push(worker)
      pending?.resolve(reply)
      this.pump()
    })
    worker.on('error', (err: Error) => {
      const pending = this.busy.get(worker)
      this.busy.delete(worker)
      pending?.reject(err)
      if (!this.disposed) {
        this.idle.push(this.spawn()) // replace the crashed worker
        this.pump()
      }
    })
    return worker
  }

  private pump(): void {
    while (this.idle.length) {
      const next = this.lanes.high.shift() ?? this.lanes.low.shift()
      if (!next) return
      const worker = this.idle.pop()!
      this.busy.set(worker, next)
      worker.postMessage(next.job)
    }
  }
}

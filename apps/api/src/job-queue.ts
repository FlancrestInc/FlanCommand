interface QueuedJob {
  id: string;
  task: () => Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export class JobQueue {
  private readonly pending: QueuedJob[] = [];
  private active = 0;

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("job concurrency must be positive");
  }

  get activeCount(): number {
    return this.active;
  }

  get queuedCount(): number {
    return this.pending.length;
  }

  get queuedIds(): string[] {
    return this.pending.map((job) => job.id);
  }

  cancel(id: string): boolean {
    const index = this.pending.findIndex((job) => job.id === id);
    if (index < 0) return false;
    const [job] = this.pending.splice(index, 1);
    job?.resolve();
    return true;
  }

  enqueue(id: string, task: () => Promise<void>): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      this.pending.push({ id, task, resolve, reject });
    });
    this.drain();
    return promise;
  }

  private drain(): void {
    while (this.active < this.limit && this.pending.length) {
      const job = this.pending.shift()!;
      this.active += 1;
      void job
        .task()
        .then(job.resolve, job.reject)
        .finally(() => {
          this.active -= 1;
          this.drain();
        });
    }
  }
}

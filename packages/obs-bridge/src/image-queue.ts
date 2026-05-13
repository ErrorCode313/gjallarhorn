import { ImageCache, copyCachedTo } from "./cache";
import { log } from "./log";

type Job = { url: string; dst: string };

export class ImageQueue {
  private queue: Job[] = [];
  private inflight = 0;
  private dedupe = new Map<string, Job>();
  private totalEnqueued = 0;

  constructor(private cache: ImageCache, private concurrency: number = 4) {}

  enqueue(url: string, dst: string): void {
    if (!url || !dst) return;
    const key = `${url}|${dst}`;
    if (this.dedupe.has(key)) return;
    const job: Job = { url, dst };
    this.dedupe.set(key, job);
    this.queue.push(job);
    this.totalEnqueued++;
    this.pump();
  }

  private pump(): void {
    while (this.inflight < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.inflight++;
      this.run(job)
        .catch((e) => {
          log.error(`image job error: ${(e as Error).message}`);
        })
        .finally(() => {
          this.inflight--;
          this.dedupe.delete(`${job.url}|${job.dst}`);
          this.pump();
        });
    }
  }

  private async run(job: Job): Promise<void> {
    await copyCachedTo(this.cache, job.url, job.dst);
  }

  pendingCount(): number {
    return this.queue.length + this.inflight;
  }

  totalEnqueuedCount(): number {
    return this.totalEnqueued;
  }
}

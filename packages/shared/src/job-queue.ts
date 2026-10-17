export interface JobQueue {
  schedule(jobId: string, runAt: number): Promise<void>;
  schedulePoll(jobId: string, runAt: number): Promise<void>;
  reschedule(jobId: string, runAt: number): Promise<void>;
  cancel(jobId: string): Promise<void>;
  close(): Promise<void>;
}

export class InMemoryJobQueue implements JobQueue {
  private readonly due = new Map<string, number>();
  private readonly onDue: (jobId: string, mode?:'publish'|'poll') => Promise<void>;
  private readonly now: () => number;
  constructor(onDue: (jobId: string, mode?:'publish'|'poll') => Promise<void>, now: () => number = Date.now) {
    this.onDue = onDue;
    this.now = now;
  }
  async schedule(jobId: string, runAt: number): Promise<void> {
    if (!this.due.has(jobId)) this.due.set(jobId, runAt);
  }
  async schedulePoll(jobId:string,runAt:number):Promise<void>{this.due.set('poll:'+jobId,runAt)}
  async reschedule(jobId: string, runAt: number): Promise<void> {this.due.set(jobId, runAt)}
  async cancel(jobId: string): Promise<void> {this.due.delete(jobId);this.due.delete('poll:'+jobId)}
  async tick(): Promise<number> {
    const due = [...this.due].filter(([, at]) => at <= this.now()).sort((a, b) => a[1] - b[1]);
    let delivered = 0;
    for (const [jobId, at] of due) {
      if (this.due.get(jobId) !== at) continue;
      this.due.delete(jobId);
      try {await this.onDue(jobId.startsWith('poll:')?jobId.slice(5):jobId,jobId.startsWith('poll:')?'poll':'publish'); delivered++} catch (error) {this.due.set(jobId, at); throw error}
    }
    return delivered;
  }
  async close(): Promise<void> {this.due.clear()}
}

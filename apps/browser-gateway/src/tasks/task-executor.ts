import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {BrowserTaskResult, CreateBrowserTaskRequest, BrowserTaskState} from '../../../../packages/browser-contracts/src/index.ts';
import {id} from '../../../../packages/shared/src/ids.ts';
import {redact} from '../../../../packages/shared/src/security.ts';

type Handler = (req: CreateBrowserTaskRequest, ctx: {transition: (s: BrowserTaskState) => void}) => Promise<Record<string, unknown>>;
const legal: Record<BrowserTaskState, BrowserTaskState[]> = {
  QUEUED: ['STARTING_PROFILE', 'FAILED'], STARTING_PROFILE: ['CONNECTING_BROWSER', 'FAILED'],
  CONNECTING_BROWSER: ['NAVIGATING', 'FAILED'], NAVIGATING: ['UPLOADING', 'SUBMITTING', 'FAILED'],
  UPLOADING: ['SUBMITTING', 'FAILED'], SUBMITTING: ['VERIFYING', 'FAILED'],
  VERIFYING: ['DONE', 'FAILED'], DONE: [], FAILED: [],
};

export class TaskExecutor {
  private active = 0;
  private tasks = new Map<string, BrowserTaskResult>();
  private handlers = new Map<string, Handler>();
  private readonly max: number;
  private readonly stateFile: string | undefined;

  constructor(max = 2, stateFile?: string) {
    this.max = max;
    this.stateFile = stateFile;
    if (stateFile && existsSync(stateFile)) {
      const saved = JSON.parse(readFileSync(stateFile, 'utf8')) as BrowserTaskResult[];
      for (const task of saved) {
        if (task.state !== 'DONE' && task.state !== 'FAILED') {
          const uncertain = task.state === 'SUBMITTING' || task.state === 'VERIFYING';
          task.state = 'FAILED';
          task.error = uncertain
            ? {code: 'OUTCOME_UNKNOWN', message: 'Gateway stopped during submission; reconcile the post manually', retryable: false}
            : {code: 'GATEWAY_RESTART_PRE_SUBMIT', message: 'Gateway stopped before submission; safe to retry', retryable: true};
        }
        this.tasks.set(task.taskId, task);
      }
      this.persist();
    }
  }

  register(type: string, handler: Handler) {this.handlers.set(type, handler)}
  get(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('TASK_NOT_FOUND');
    return task;
  }

  private persist() {
    if (!this.stateFile) return;
    mkdirSync(dirname(this.stateFile), {recursive: true});
    const temp = `${this.stateFile}.${randomUUID()}.tmp`;
    writeFileSync(temp, JSON.stringify([...this.tasks.values()]));
    renameSync(temp, this.stateFile);
  }

  private set(task: BrowserTaskResult, next: BrowserTaskState) {
    if (!legal[task.state].includes(next)) throw new Error(`ILLEGAL_TRANSITION:${task.state}->${next}`);
    task.state = next;
    this.persist();
  }

  async submit(req: CreateBrowserTaskRequest) {
    const taskId = req.correlationId ?? id('bt');
    if (this.tasks.has(taskId)) return {taskId};
    if (this.active >= this.max) throw new Error('CAPACITY_EXCEEDED');
    const task: BrowserTaskResult = {taskId, state: 'QUEUED'};
    this.tasks.set(taskId, task);
    try {this.persist()} catch (error) {this.tasks.delete(taskId); throw error}
    this.active++;
    const handler = this.handlers.get(req.type);
    if (!handler) {
      task.state = 'FAILED';
      task.error = {code: 'NO_HANDLER', message: 'No handler', retryable: false};
      this.persist();
      this.active--;
      return {taskId};
    }
    try {
      const result = await handler(req, {transition: state => this.set(task, state)});
      task.result = result;
      if (task.state !== 'DONE') this.set(task, 'DONE');
      else this.persist();
    } catch (error: any) {
      const uncertain = task.state === 'SUBMITTING' || task.state === 'VERIFYING';
      task.state = 'FAILED';
      task.error = uncertain
        ? {code: 'OUTCOME_UNKNOWN', message: 'Browser submission may have completed; reconcile the post manually', retryable: false}
        : {code: error.code ?? 'BROWSER_ERROR', message: String(error.message ?? error), retryable: error.retryable ?? true};
      task.debugArtifact = JSON.stringify(redact({taskId, error: task.error, payload: req.payload}));
      this.persist();
    } finally {this.active--}
    return {taskId};
  }

  health(gpmLoginHealthy = true) {return {status: gpmLoginHealthy ? 'ONLINE' : 'DEGRADED' as const,
    activeTasks: this.active, capacity: this.max, gpmLoginHealthy, lastHeartbeatAt: Date.now()}}
}

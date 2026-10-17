import test from 'node:test';
import assert from 'node:assert/strict';
import type {JobQueue} from '../../packages/shared/src/job-queue.ts';

export interface QueueFixture {
  queue: JobQueue;
  delivered: string[];
  tick(): Promise<void>;
  close(): Promise<void>;
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function runJobQueueContract(name: string, make: () => Promise<QueueFixture>): void {
  test(`${name}: schedule twice delivers once`, async (t) => {
    const fixture = await make();
    t.after(() => fixture.close());
    const id = `once-${Date.now()}`;
    await fixture.queue.schedule(id, Date.now() + 100);
    await fixture.queue.schedule(id, Date.now() + 100);
    await wait(300);
    await fixture.tick();
    assert.deepEqual(fixture.delivered, [id]);
  });

  test(`${name}: reschedule replaces old time and cancel prevents delivery`, async (t) => {
    const fixture = await make();
    t.after(() => fixture.close());
    const rescheduled = `later-${Date.now()}`;
    const cancelled = `cancel-${Date.now()}`;
    await fixture.queue.schedule(rescheduled, Date.now() + 100);
    await fixture.queue.reschedule(rescheduled, Date.now() + 700);
    await fixture.queue.schedule(cancelled, Date.now() + 100);
    await fixture.queue.cancel(cancelled);
    await wait(400);
    await fixture.tick();
    assert.deepEqual(fixture.delivered, []);
    await wait(550);
    await fixture.tick();
    assert.deepEqual(fixture.delivered, [rescheduled]);
  });
}

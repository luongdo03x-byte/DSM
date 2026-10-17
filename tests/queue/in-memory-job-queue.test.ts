import {InMemoryJobQueue} from '../../packages/shared/src/job-queue.ts';
import {runJobQueueContract} from './job-queue-contract.ts';

runJobQueueContract('memory queue', async () => {
  const delivered: string[] = [];
  const queue = new InMemoryJobQueue(async id => {delivered.push(id)});
  return {queue, delivered, tick: async () => {await queue.tick()}, close: () => queue.close()};
});

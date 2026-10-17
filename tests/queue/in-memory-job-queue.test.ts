import {InMemoryJobQueue} from '../../packages/shared/src/job-queue.ts';
import {runJobQueueContract} from './job-queue-contract.ts';
import test from 'node:test';
import assert from 'node:assert/strict';

runJobQueueContract('memory queue', async () => {
  const delivered: string[] = [];
  const queue = new InMemoryJobQueue(async id => {delivered.push(id)});
  return {queue, delivered, tick: async () => {await queue.tick()}, close: () => queue.close()};
});

test('memory queue delivers a poll separately from a publish job',async()=>{
  const modes:string[]=[];let now=100;
  const queue=new InMemoryJobQueue(async(id,mode)=>{modes.push(`${id}:${mode}`)},()=>now);
  await queue.schedule('job',100);await queue.schedulePoll('job',110);
  await queue.tick();now=110;await queue.tick();
  assert.deepEqual(modes,['job:publish','job:poll']);await queue.close();
});

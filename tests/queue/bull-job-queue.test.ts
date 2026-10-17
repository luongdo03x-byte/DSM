import {Worker, Queue} from 'bullmq';
import IORedis from 'ioredis';
import {BullJobQueue} from '../../apps/worker/src/queue/bull-job-queue.ts';
import {runJobQueueContract} from './job-queue-contract.ts';
import test from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.REDIS_URL_TEST;
if (!url) throw new Error('REDIS_URL_TEST is required (docker compose up -d redis)');

runJobQueueContract('bull queue', async () => {
  const name = `dsm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const delivered: string[] = [];
  const queue = new BullJobQueue({url}, name);
  const connection = new IORedis(url, {maxRetriesPerRequest: null});
  const worker = new Worker(name, async job => {delivered.push(String(job.data.jobId))}, {connection, concurrency: 1});
  await worker.waitUntilReady();
  return {queue, delivered, tick: async () => {}, close: async () => {
    await worker.close();
    const raw = new Queue(name, {connection});
    await raw.obliterate({force: true});
    await raw.close();
    await queue.close();
    connection.disconnect();
  }};
});

test('bull queue delivers poll flag for asynchronous publishing',async()=>{
  const name=`dsm-poll-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const queue=new BullJobQueue({url},name),connection=new IORedis(url,{maxRetriesPerRequest:null}),delivered:boolean[]=[];
  const worker=new Worker(name,async job=>{delivered.push(job.data.poll===true)},{connection,concurrency:1});
  try{
    await worker.waitUntilReady();await queue.schedulePoll('job',Date.now()+50);
    const deadline=Date.now()+2000;while(!delivered.length&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
    assert.deepEqual(delivered,[true]);
  }finally{await worker.close();const raw=new Queue(name,{connection});await raw.obliterate({force:true});await raw.close();await queue.close();connection.disconnect()}
});

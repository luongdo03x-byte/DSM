import {Queue} from 'bullmq';
import IORedis from 'ioredis';
import {SUBTITLE_QUEUE,type SubtitleJob} from './subtitle-job.ts';

export class SubtitleQueue{
  private readonly connection:IORedis;
  private readonly queue:Queue<SubtitleJob>;
  constructor(url:string){this.connection=new IORedis(url,{maxRetriesPerRequest:null});this.queue=new Queue<SubtitleJob>(SUBTITLE_QUEUE,{connection:this.connection})}
  async enqueue(job:SubtitleJob){const existing=await this.queue.getJob(job.assetId);if(existing){if(await existing.getState()==='failed')await existing.retry();return}await this.queue.add('transcribe',job,{jobId:job.assetId,attempts:2,backoff:{type:'exponential',delay:30_000},removeOnComplete:{age:86_400},removeOnFail:{age:7*86_400}})}
  async close(){await this.queue.close();this.connection.disconnect()}
}

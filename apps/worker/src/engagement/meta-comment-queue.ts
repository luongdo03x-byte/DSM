import {createHash} from 'node:crypto';
import {Queue} from 'bullmq';
import IORedis from 'ioredis';
import type {MetaCommentEvent} from '../../../api/src/integrations/meta/meta-webhook.ts';

export const META_COMMENT_QUEUE='dsm-meta-comments';

export class MetaCommentQueue {
  private readonly connection:IORedis;
  private readonly queue:Queue<MetaCommentEvent>;
  constructor(redisUrl:string){
    this.connection=new IORedis(redisUrl,{maxRetriesPerRequest:1,connectTimeout:800,commandTimeout:800,retryStrategy:attempt=>Math.min(attempt*200,1000)});
    this.queue=new Queue<MetaCommentEvent>(META_COMMENT_QUEUE,{connection:this.connection});
  }
  async enqueue(event:MetaCommentEvent):Promise<void>{
    const jobId='meta-'+createHash('sha256').update(JSON.stringify(event)).digest('hex');
    await this.queue.add('ingest',event,{jobId,attempts:5,backoff:{type:'exponential',delay:1000},removeOnComplete:true,removeOnFail:1000});
  }
  async close(){await this.queue.close();this.connection.disconnect()}
}

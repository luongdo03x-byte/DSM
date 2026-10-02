import type {MemoryStore} from '../../../../../packages/shared/src/store.ts';
import {BatchStatusService} from './batch-status.service.ts';
export class PublishingActivityController{
  private store:MemoryStore;private status:BatchStatusService;
  constructor(store:MemoryStore){this.store=store;this.status=new BatchStatusService(store)}
  batch(batchId:string){const jobs=[...this.store.publishJobs.values()].filter(j=>j.batchId===batchId);return{batchId,status:this.status.get(batchId),jobs:jobs.map(j=>({...j,attempts:this.store.publishAttempts.filter(a=>a.publishJobId===j.id)}))}}
  retry(jobId:string){return this.status.manualRetry(jobId)}
}

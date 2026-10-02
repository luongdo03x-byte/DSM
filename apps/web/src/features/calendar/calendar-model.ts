import type {BatchStatusService} from '../../../../api/src/modules/publishing/batch-status.service.ts';
export class CalendarModel{private s:BatchStatusService;constructor(s:BatchStatusService){this.s=s}reschedule(jobId:string,when:number){return this.s.reschedule(jobId,when)}cancel(jobId:string){return this.s.cancel(jobId)}}

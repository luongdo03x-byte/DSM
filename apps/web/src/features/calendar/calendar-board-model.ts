import type {CalendarEntry} from '../../../../api/src/modules/publishing/publishing.service.ts';
import type {JobStatus,Platform} from '../../../../../packages/shared/src/domain.ts';
import {fromUtcMs,toUtcMs} from '../../lib/ui/brand-time.ts';

export function canDrag(entry:CalendarEntry):boolean{return entry.status==='QUEUED'||entry.status==='RETRYING'}
export function moveToDate(entry:CalendarEntry,targetDate:string,timeZone:string):number{
  if(!canDrag(entry))throw new Error('JOB_NOT_RESCHEDULABLE');
  return toUtcMs(targetDate,fromUtcMs(entry.scheduledAt,timeZone).time,timeZone);
}
export function groupByDay(entries:CalendarEntry[],timeZone:string):Record<string,CalendarEntry[]>{
  const groups:Record<string,CalendarEntry[]>={};
  for(const entry of entries){const date=fromUtcMs(entry.scheduledAt,timeZone).date;(groups[date]??=[]).push(entry)}
  for(const rows of Object.values(groups))rows.sort((a,b)=>a.scheduledAt-b.scheduledAt);
  return Object.fromEntries(Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)));
}
export function filterEntries(entries:CalendarEntry[],filter:{platforms?:Platform[];statuses?:JobStatus[]}):CalendarEntry[]{
  return entries.filter(entry=>(!filter.platforms?.length||filter.platforms.includes(entry.platform))&&(!filter.statuses?.length||filter.statuses.includes(entry.status)));
}

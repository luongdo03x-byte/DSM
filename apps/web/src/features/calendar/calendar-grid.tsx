'use client';
import {useRef,type DragEvent,type ReactNode} from 'react';
import type {CalendarEntry} from '../../../../api/src/modules/publishing/publishing.service.ts';
import {monthGrid} from '../../lib/ui/brand-time.ts';
import {canDrag,groupByDay} from './calendar-board-model.ts';

type CalendarEvent={date:string;name:string;kind:string};
export function CalendarGrid({entries,year,month,timeZone,mode,weekDate,onMove,renderEntry,events=[]}:{entries:CalendarEntry[];year:number;month:number;timeZone:string;mode:'month'|'week';weekDate:string;onMove:(entry:CalendarEntry,date:string)=>void;renderEntry:(entry:CalendarEntry)=>ReactNode;events?:CalendarEvent[]}){
  const draggingId=useRef('');
  const weeks=monthGrid(year,month,timeZone),groups=groupByDay(entries,timeZone);
  const selectedWeeks=mode==='week'?weeks.filter(week=>week.some(cell=>cell.date===weekDate)):weeks;
  const visibleWeeks=selectedWeeks.length?selectedWeeks:weeks.slice(0,1);
  function drop(event:DragEvent<HTMLElement>,date:string){event.preventDefault();const id=event.dataTransfer.getData('text/plain')||draggingId.current;draggingId.current='';const entry=entries.find(item=>item.jobId===id);if(entry&&canDrag(entry))onMove(entry,date)}
  return <div className="calendar-board" role="grid" aria-label={mode==='month'?'Lịch tháng':'Lịch tuần'}><div className="calendar-board__head">{['Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy','Chủ Nhật'].map(day=><strong key={day}>{day}</strong>)}</div>{visibleWeeks.map((week,index)=><div className="calendar-board__week" role="row" key={index}>{week.map(cell=><section role="gridcell" key={cell.date} data-calendar-date={cell.date} className={'calendar-board__day'+(cell.inMonth?'':' calendar-board__day--outside')} onDragOver={event=>event.preventDefault()} onDrop={event=>drop(event,cell.date)}><time dateTime={cell.date}>{Number(cell.date.slice(-2))}</time>{events.filter(item=>item.date===cell.date).map(item=><div key={item.name} className="calendar-event" data-testid="calendar-event" data-event-kind={item.kind}>{item.name}</div>)}{(groups[cell.date]??[]).map(entry=><div key={entry.jobId} draggable={canDrag(entry)} onDragStart={event=>{if(canDrag(entry)){draggingId.current=entry.jobId;event.dataTransfer.setData('text/plain',entry.jobId)}}}>{renderEntry(entry)}</div>)}</section>)}</div>)}</div>;
}

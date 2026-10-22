'use client';
import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import type {CalendarEntry} from '../../../../api/src/modules/publishing/publishing.service.ts';
import type {JobStatus,Platform} from '../../../../../packages/shared/src/domain.ts';
import {browserApi} from '../../lib/browser-runtime.ts';
import {fromUtcMs,monthGrid,toUtcMs} from '../../lib/ui/brand-time.ts';
import {platformLabel,statusLabel,statusTone} from '../../lib/ui/status.ts';
import {Badge} from '../../components/ui/badge.tsx';
import {Button} from '../../components/ui/button.tsx';
import {Card} from '../../components/ui/card.tsx';
import {EmptyState,ErrorState,LoadingState} from '../../components/ui/page-state.tsx';
import {PageHeader} from '../../components/ui/page-header.tsx';
import {CalendarGrid} from './calendar-grid.tsx';
import {canDrag,filterEntries} from './calendar-board-model.ts';

const json={headers:{'content-type':'application/json'}};
function plusDays(date:string,days:number){const [year,month,day]=date.split('-').map(Number);return new Date(Date.UTC(year!,month!-1,day!+days)).toISOString().slice(0,10)}
function monthName(year:number,month:number){return new Intl.DateTimeFormat('vi-VN',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1)))}

export function CalendarDashboard({brandId}:{brandId:string}){
  const [entries,setEntries]=useState<CalendarEntry[]>([]),[timeZone,setTimeZone]=useState('Asia/Ho_Chi_Minh');
  const [events,setEvents]=useState<{date:string;name:string;kind:string}[]>([]);
  const [period,setPeriod]=useState(()=>{const now=new Date();return{year:now.getUTCFullYear(),month:now.getUTCMonth()+1}});
  const [mode,setMode]=useState<'month'|'week'>('month');
  const [weekDate,setWeekDate]=useState(()=>new Date().toISOString().slice(0,10));
  const [platform,setPlatform]=useState<Platform|''>(''),[status,setStatus]=useState<JobStatus|''>('');
  const [loading,setLoading]=useState(true),[busyId,setBusyId]=useState(''),[error,setError]=useState(''),[success,setSuccess]=useState('');
  const [rescheduleId,setRescheduleId]=useState(''),[newDate,setNewDate]=useState(''),[newTime,setNewTime]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const brand=await browserApi.request<{timezone:string}>(`/brands/${brandId}`),zone=brand.timezone||'Asia/Ho_Chi_Minh';setTimeZone(zone);
      const growth=await browserApi.request<{vnEvents:{date:string;name:string;kind:string}[]}>('/brands/'+brandId+'/growth?days=28&year='+period.year);setEvents(growth.vnEvents);
      const cells=monthGrid(period.year,period.month,zone).flat();
      const from=toUtcMs(cells[0]!.date,'00:00',zone),to=toUtcMs(plusDays(cells.at(-1)!.date,1),'00:00',zone);
      setEntries(await browserApi.request<CalendarEntry[]>(`/brands/${brandId}/calendar?from=${from}&to=${to}`));
    }catch{setError('Không thể tải lịch đăng. Vui lòng thử lại.')}finally{setLoading(false)}
  },[brandId,period.year,period.month]);
  useEffect(()=>{void load()},[load]);
  const visible=useMemo(()=>filterEntries(entries,{...(platform?{platforms:[platform]}:{}),...(status?{statuses:[status]}:{})}),[entries,platform,status]);
  function navigate(delta:number){if(mode==='week'){const date=plusDays(weekDate,delta*7),target=new Date(date+'T00:00:00Z');setWeekDate(date);setPeriod({year:target.getUTCFullYear(),month:target.getUTCMonth()+1});return}const target=new Date(Date.UTC(period.year,period.month-1+delta,1));setPeriod({year:target.getUTCFullYear(),month:target.getUTCMonth()+1})}
  async function move(entry:CalendarEntry,date:string,time?:string){
    if(!canDrag(entry)){setError('Công việc đã đăng hoặc đang xử lý không thể đổi lịch.');return}
    const hour=time??fromUtcMs(entry.scheduledAt,timeZone).time;
    let scheduledAt:number;
    try{scheduledAt=toUtcMs(date,hour,timeZone)}catch{setError('Ngày hoặc giờ không hợp lệ theo múi giờ thương hiệu.');return}
    setBusyId(entry.jobId);setError('');setSuccess('');
    try{await browserApi.request(`/brands/${brandId}/calendar/${entry.jobId}`,{method:'PATCH',...json,body:JSON.stringify({scheduledAt})});setSuccess('Đã cập nhật lịch đăng.');setRescheduleId('');await load()}
    catch{setError('Không thể đổi lịch. Chỉ công việc đang chờ hoặc thử lại mới được đổi; thời điểm mới phải cách hiện tại ít nhất 5 phút và không quá 75 ngày.');await load()}
    finally{setBusyId('')}
  }
  async function retry(entry:CalendarEntry){setBusyId(entry.jobId);setError('');try{await browserApi.request(`/brands/${brandId}/publish-jobs/${entry.jobId}/retry`,{method:'POST'});setSuccess('Đã đưa công việc vào hàng đợi thử lại.');await load()}catch{setError('Không thể thử lại công việc này.')}finally{setBusyId('')}}
  async function cancel(entry:CalendarEntry){if(!window.confirm('Hủy công việc đăng '+platformLabel(entry.platform)+' này?'))return;setBusyId(entry.jobId);setError('');try{await browserApi.request(`/brands/${brandId}/calendar/${entry.jobId}`,{method:'DELETE'});setSuccess('Đã hủy công việc.');await load()}catch{setError('Không thể hủy công việc ở trạng thái hiện tại.')}finally{setBusyId('')}}
  function jobCard(entry:CalendarEntry){const instant=fromUtcMs(entry.scheduledAt,timeZone),editable=canDrag(entry);return <article className="job-card" data-job-id={entry.jobId}><div><div className="job-card__title">{entry.title||'Bài viết'} · {platformLabel(entry.platform)}</div><div className="job-card__meta">{instant.label} · {timeZone}</div><div style={{marginTop:9}}><Badge tone={statusTone(entry.status)}>{entry.statusLabel??statusLabel(entry.status)}</Badge></div>{entry.errorCode?<div className="feedback feedback--error">{entry.errorCode}</div>:null}{entry.warning?<div className="feedback">{entry.warning}</div>:null}{rescheduleId===entry.jobId?<form onSubmit={(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();void move(entry,newDate,newTime)}} className="calendar-time-form"><label className="field">Ngày<input type="date" value={newDate} onChange={event=>setNewDate(event.target.value)} required/></label><label className="field">Giờ ({timeZone})<input type="time" value={newTime} onChange={event=>setNewTime(event.target.value)} required/></label><Button size="sm" type="submit" disabled={busyId===entry.jobId}>Lưu lịch</Button><Button size="sm" variant="ghost" type="button" onClick={()=>setRescheduleId('')}>Đóng</Button></form>:null}</div><div className="job-card__actions">{entry.status==='FAILED'?<Button size="sm" disabled={busyId===entry.jobId} onClick={()=>void retry(entry)}>Thử lại</Button>:null}{editable?<Button size="sm" variant="secondary" onClick={()=>{setRescheduleId(entry.jobId);setNewDate(instant.date);setNewTime(instant.time)}}>Đổi giờ</Button>:null}{editable&&entry.status!=="PROCESSING"?<Button size="sm" variant="danger" disabled={busyId===entry.jobId} onClick={()=>void cancel(entry)}>Hủy đăng</Button>:null}</div></article>}
  return <div className="section-stack"><PageHeader title="Lịch đăng" description={`Theo dõi và kéo bài sang ngày khác; giờ hiển thị theo ${timeZone}.`} actions={<Button variant="secondary" onClick={()=>void load()} disabled={loading}>Làm mới</Button>}/>
    {error?<ErrorState message={error}/>:null}{success?<div className="feedback feedback--success" role="status">{success}</div>:null}
    <div className="stats-grid"><div className="ui-card stat-card"><span className="stat-card__label">Đang chờ</span><strong className="stat-card__value">{entries.filter(x=>x.status==='QUEUED').length}</strong></div><div className="ui-card stat-card"><span className="stat-card__label">Đang xử lý</span><strong className="stat-card__value">{entries.filter(x=>x.status==='PROCESSING'||x.status==='RETRYING').length}</strong></div><div className="ui-card stat-card"><span className="stat-card__label">Đã đăng</span><strong className="stat-card__value">{entries.filter(x=>x.status==='PUBLISHED').length}</strong></div><div className="ui-card stat-card"><span className="stat-card__label">Cần xử lý</span><strong className="stat-card__value">{entries.filter(x=>x.status==='FAILED').length}</strong></div></div>
    <Card><div className="calendar-toolbar"><div className="row-actions"><Button variant="ghost" onClick={()=>navigate(-1)}>{mode==='week'?'Tuần trước':'Tháng trước'}</Button><strong>{monthName(period.year,period.month)}</strong><Button variant="ghost" onClick={()=>navigate(1)}>{mode==='week'?'Tuần sau':'Tháng sau'}</Button></div><div className="row-actions"><label className="field">Hiển thị<select aria-label="Hiển thị lịch" value={mode} onChange={event=>{const next=event.target.value as 'month'|'week';if(next==='week'){const today=fromUtcMs(Date.now(),timeZone).date;setWeekDate(today.slice(0,7)===`${period.year}-${String(period.month).padStart(2,'0')}`?today:`${period.year}-${String(period.month).padStart(2,'0')}-01`)}setMode(next)}}><option value="month">Tháng</option><option value="week">Tuần</option></select></label><label className="field">Nền tảng<select aria-label="Lọc nền tảng" value={platform} onChange={event=>setPlatform(event.target.value as Platform|'')}><option value="">Tất cả</option>{(['FACEBOOK','INSTAGRAM','THREADS','TIKTOK','YOUTUBE'] as const).map(value=><option value={value} key={value}>{platformLabel(value)}</option>)}</select></label><label className="field">Trạng thái<select aria-label="Lọc trạng thái" value={status} onChange={event=>setStatus(event.target.value as JobStatus|'')}><option value="">Tất cả</option>{(['QUEUED','RETRYING','PROCESSING','PUBLISHED','FAILED','CANCELLED'] as const).map(value=><option value={value} key={value}>{statusLabel(value)}</option>)}</select></label></div></div>
      {loading?<LoadingState label="Đang tải lịch đăng..."/>:visible.length===0?<EmptyState title="Chưa có công việc nào" description="Công việc xuất bản sẽ xuất hiện sau khi bạn đăng hoặc lên lịch nội dung."/>:null}
      {!loading?<CalendarGrid entries={visible} year={period.year} month={period.month} timeZone={timeZone} mode={mode} weekDate={weekDate} onMove={(entry,date)=>void move(entry,date)} renderEntry={jobCard} events={events}/>:null}
    </Card>
  </div>;
}

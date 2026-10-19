'use client';
import type {ComposeSnapshot} from './compose-model.ts';

export function SchedulePicker({schedule,timeZone,onChange}:{schedule:ComposeSnapshot['schedule'];timeZone:string;onChange:(value:ComposeSnapshot['schedule'])=>void}){
  return <div className="field"><label htmlFor="compose-schedule-mode">Thời điểm đăng</label><select id="compose-schedule-mode" value={schedule.mode} onChange={event=>onChange(event.target.value==='at'?{mode:'at',date:'',time:''}:{mode:'now'})}><option value="now">Đăng ngay</option><option value="at">Lên lịch</option></select>{schedule.mode==='at'?<div className="form-grid"><label className="field">Ngày<input type="date" value={schedule.date} onChange={event=>onChange({...schedule,date:event.target.value})}/></label><label className="field">Giờ<input type="time" value={schedule.time} onChange={event=>onChange({...schedule,time:event.target.value})}/></label></div>:null}<small>Giờ theo múi giờ {timeZone}</small></div>;
}

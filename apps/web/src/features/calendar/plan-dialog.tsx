'use client';
import {useState,type FormEvent} from 'react';
import type {SocialAccount} from '../../../../../packages/shared/src/domain.ts';
import {browserApi} from '../../lib/browser-runtime.ts';
import {platformLabel} from '../../lib/ui/status.ts';
import {Button} from '../../components/ui/button.tsx';

type Result={created:Array<{id:string}>;skipped:Array<{date:string}>;issues:Array<{message:string}>};
export function PlanDialog({brandId,accounts,today,onDone,onClose}:{brandId:string;accounts:SocialAccount[];today:string;onDone:(result:Result)=>void;onClose:()=>void}){
  const [startDate,setStartDate]=useState(today),[ids,setIds]=useState<string[]>(accounts.map(account=>account.id)),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!ids.length){setError('Hãy chọn ít nhất một kênh.');return}
    setBusy(true);setError('');
    try{const result=await browserApi.request<Result>(`/brands/${brandId}/ai/plan`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({startDate,socialAccountIds:ids})});onDone(result)}
    catch{setError('Không thể lập kế hoạch. Hãy kiểm tra trụ cột nội dung và cấu hình AI rồi thử lại.')}
    finally{setBusy(false)}
  }
  return <div className="compose-dialog-backdrop"><section className="ui-card plan-dialog" role="dialog" aria-modal="true" aria-labelledby="plan-dialog-title"><h2 id="plan-dialog-title">Lập kế hoạch 30 ngày</h2><p>AI sẽ tạo ý tưởng thành bản nháp trên lịch. Bạn cần soạn và duyệt từng bài trước khi đăng.</p><form onSubmit={event=>void submit(event)}><label className="field">Ngày bắt đầu<input type="date" value={startDate} min={today} onChange={event=>setStartDate(event.target.value)} required/></label><fieldset><legend>Kênh cần lên kế hoạch</legend>{accounts.map(account=><label className="account-choice" key={account.id}><input type="checkbox" checked={ids.includes(account.id)} onChange={()=>setIds(previous=>previous.includes(account.id)?previous.filter(id=>id!==account.id):[...previous,account.id])}/><span>{platformLabel(account.platform)} · {account.username??account.id}</span></label>)}</fieldset>{error?<p role="alert" className="feedback feedback--error">{error}</p>:null}<div className="form-actions"><Button type="button" variant="ghost" onClick={onClose}>Đóng</Button><Button type="submit" disabled={busy||!ids.length}>{busy?'Đang lập kế hoạch...':'Tạo bản nháp'}</Button></div></form></section></div>;
}

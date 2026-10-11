'use client';

import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {browserApi} from '../../lib/browser-runtime.ts';
import {formatDateTime} from '../../lib/ui/format.ts';
import {platformLabel,statusLabel} from '../../lib/ui/status.ts';
import {Badge} from '../../components/ui/badge.tsx';
import {Button} from '../../components/ui/button.tsx';
import {Card} from '../../components/ui/card.tsx';
import {EmptyState,ErrorState,LoadingState} from '../../components/ui/page-state.tsx';
import {PageHeader} from '../../components/ui/page-header.tsx';
import {publishTargetSummary,type PublishValidation} from '../content/content-model.ts';

type ContentOption={id:string;title:string;type:string};
type AccountOption={id:string;platform:string;status:string;publishMode?:string;username?:string};
type PublishResult={batchId?:string;results?:Array<{socialAccountId:string;platform:string;valid:boolean;jobId?:string;errors?:string[];warnings?:string[]}>};

export function PublishManager({brandId}:{brandId:string}){
  const [content,setContent]=useState<ContentOption[]>([]);
  const [accounts,setAccounts]=useState<AccountOption[]>([]);
  const [contentId,setContentId]=useState('');
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [scheduledAt,setScheduledAt]=useState('');
  const [validation,setValidation]=useState<PublishValidation[]>([]);
  const [result,setResult]=useState<PublishResult|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  async function load(){
    setLoading(true);setError('');
    try{
      const [contentRows,accountRows]=await Promise.all([
        browserApi.request<ContentOption[]>('/brands/'+brandId+'/content'),
        browserApi.request<AccountOption[]>('/brands/'+brandId+'/accounts')
      ]);
      setContent(contentRows);setAccounts(accountRows);
    }catch{setError('Không thể tải nội dung và tài khoản để đăng bài.')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[brandId]);
  const selected=useMemo(()=>accounts.filter(account=>selectedIds.includes(account.id)),[accounts,selectedIds]);
  const summary=useMemo(()=>publishTargetSummary(validation),[validation]);
  function changeSelection(id:string,checked:boolean){
    setSelectedIds(current=>checked?[...current.filter(value=>value!==id),id]:current.filter(value=>value!==id));
    setValidation([]);setResult(null);setSuccess('');
  }
  async function validate(event?:FormEvent){
    event?.preventDefault();setError('');setSuccess('');setResult(null);setValidation([]);
    if(!contentId){setError('Hãy chọn nội dung cần đăng.');return}
    if(!selectedIds.length){setError('Hãy chọn ít nhất một tài khoản mạng xã hội.');return}
    setBusy(true);
    try{
      const rows=await browserApi.request<PublishValidation[]>('/brands/'+brandId+'/publish/validate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contentId,socialAccountIds:selectedIds})});
      setValidation(rows);
      if(rows.every(row=>!row.valid))setError('Không có tài khoản nào sẵn sàng đăng. Kiểm tra biến thể và cấu hình tài khoản.');
    }catch{setError('Không thể kiểm tra điều kiện đăng bài. Vui lòng thử lại.')}
    finally{setBusy(false)}
  }
  async function publish(){
    if(!summary.canPublish){setError('Hãy kiểm tra điều kiện đăng và bảo đảm có ít nhất một đích hợp lệ.');return}
    if(scheduledAt&&new Date(scheduledAt).getTime()<=Date.now()){setError('Thời gian lên lịch phải ở tương lai.');return}
    setBusy(true);setError('');setSuccess('');
    try{
      const validIds=summary.validTargets.map(target=>target.socialAccountId);
      const payload={contentId,socialAccountIds:validIds,...(scheduledAt?{scheduledAt:new Date(scheduledAt).getTime()}:{})};
      const output=await browserApi.request<PublishResult>('/brands/'+brandId+'/publish',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      setResult(output);setSuccess(scheduledAt?'Đã gửi yêu cầu lên lịch cho các đích hợp lệ.':'Đã tạo công việc xuất bản cho các đích hợp lệ.');
    }catch{setError('Không thể tạo công việc xuất bản. Vui lòng thử lại.')}
    finally{setBusy(false)}
  }
  if(loading)return <LoadingState label="Đang tải dữ liệu đăng bài..."/>;
  return <div className="section-stack">
    <PageHeader title="Đăng bài" description="Kiểm tra từng tài khoản trước khi đăng ngay hoặc lên lịch xuất bản."/>
    {error?<ErrorState message={error}/>:null}{success?<div className="feedback feedback--success" role="status">{success}</div>:null}
    <div className="publish-layout">
      <Card>
        <h2 className="panel-title">Thiết lập xuất bản</h2>
        <form className="publish-form" onSubmit={event=>void validate(event)}>
          <div className="field"><label htmlFor="publish-content">Nội dung</label><select id="publish-content" value={contentId} onChange={event=>{setContentId(event.target.value);setValidation([]);setResult(null)}} required><option value="">Chọn nội dung...</option>{content.map(item=><option key={item.id} value={item.id}>{item.title} · {item.type}</option>)}</select></div>
          <div className="field" style={{marginTop:18}}><label>Tài khoản nhận bài</label>{accounts.length===0?<p className="muted">Chưa có tài khoản mạng xã hội.</p>:<div className="account-choice-list">{accounts.map(account=><label className="account-choice" key={account.id}><input type="checkbox" checked={selectedIds.includes(account.id)} onChange={event=>changeSelection(account.id,event.target.checked)}/><span><strong>{platformLabel(account.platform)}</strong><br/><small>{account.username??account.id} · {statusLabel(account.status)} · {account.publishMode==='BROWSER'?'Trình duyệt':account.publishMode==='API'?'API':'Kết hợp'}</small></span></label>)}</div>}</div>
          <div className="field" style={{marginTop:18}}><label htmlFor="publish-schedule">Lên lịch (không bắt buộc)</label><input id="publish-schedule" type="datetime-local" value={scheduledAt} onChange={event=>{setScheduledAt(event.target.value);setResult(null)}}/></div>
          <div className="form-actions"><Button variant="ghost" type="button" onClick={()=>{setValidation([]);setResult(null);setSuccess('');setError('')}}>Đặt lại kiểm tra</Button><Button type="submit" disabled={busy}>{busy?'Đang kiểm tra...':'Kiểm tra điều kiện'}</Button></div>
        </form>
      </Card>
      <Card>
        <div className="panel__header"><h2>Kết quả kiểm tra</h2><Badge tone={summary.validCount?'success':'neutral'}>{summary.validCount} hợp lệ</Badge></div>
        {validation.length===0?<EmptyState title="Chưa kiểm tra" description="Chọn nội dung và tài khoản, sau đó kiểm tra trước khi đăng."/>:<div className="validation-list">{validation.map(target=><div className="validation-item" key={target.socialAccountId}>
          <div><strong>{platformLabel(target.platform)}</strong><p>{target.valid?'Đủ điều kiện đăng':(target.errors??[]).map(error=>error==='VARIANT_NOT_READY'?'Biến thể chưa sẵn sàng':error==='ACCOUNT_NOT_FOUND'?'Không tìm thấy tài khoản':error).join(' · ')||'Không đủ điều kiện'}</p>{target.warnings?.length?<p>Cảnh báo: {target.warnings.join(' · ')}</p>:null}</div>
          <Badge tone={target.valid?'success':'danger'}>{target.valid?'Hợp lệ':'Không hợp lệ'}</Badge>
        </div>)}</div>}
        {summary.invalidCount>0?<p className="muted">{summary.invalidCount} đích không hợp lệ sẽ không được gửi đi.</p>:null}
        <div className="form-actions"><Button onClick={()=>void publish()} disabled={busy||!summary.canPublish}>{busy?'Đang gửi...':scheduledAt?'Xác nhận lên lịch':'Đăng các đích hợp lệ'}</Button></div>
      </Card>
    </div>
    {result?<Card><div className="panel__header"><h2>Kết quả tạo công việc</h2>{result.batchId?<Badge tone="info">Batch {result.batchId}</Badge>:null}</div>
      {!result.results?.length?<EmptyState title="Không có công việc được tạo"/>:<div className="validation-list">{result.results.map((row,index)=><div className="validation-item" key={row.socialAccountId+'-'+index}><div><strong>{platformLabel(row.platform)}</strong><p>{row.jobId?'Mã công việc: '+row.jobId:(row.errors??[]).join(' · ')||'Không tạo được công việc'}</p></div><Badge tone={row.jobId?'success':'danger'}>{row.jobId?'Đã đưa vào hàng đợi':'Thất bại'}</Badge></div>)}</div>}
      <p className="muted">Thời điểm yêu cầu: {formatDateTime(Date.now())}</p>
    </Card>:null}
  </div>;
}

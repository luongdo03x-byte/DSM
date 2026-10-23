'use client';
import {useCallback,useEffect,useState} from 'react';
import {browserApi} from '../../lib/browser-runtime.ts';
import {PageHeader} from '../../components/ui/page-header.tsx';
import {Card} from '../../components/ui/card.tsx';
import {ErrorState,LoadingState} from '../../components/ui/page-state.tsx';
import {renderTemplate} from '../../../../../packages/shared/src/engagement/rules.ts';
import type {SocialComment,ReplyTemplate,AutomationRule,Platform} from '../../../../../packages/shared/src/domain.ts';

const statuses:Record<SocialComment['status'],string>={NEW:'Mới',READ:'Đã đọc',REPLIED:'Đã trả lời',HIDDEN:'Đã ẩn',DELETED:'Đã xóa'};
const platforms:Platform[]=['FACEBOOK','INSTAGRAM','YOUTUBE'];
type View='comments'|'templates'|'rules';

export function InboxDashboard({brandId}:{brandId:string}){
  const [view,setView]=useState<View>('comments'),[comments,setComments]=useState<SocialComment[]>([]),[templates,setTemplates]=useState<ReplyTemplate[]>([]),[rules,setRules]=useState<AutomationRule[]>([]);
  const [selected,setSelected]=useState<string>(''),[text,setText]=useState(''),[templateId,setTemplateId]=useState(''),[status,setStatus]=useState(''),[platform,setPlatform]=useState('');
  const [templateName,setTemplateName]=useState(''),[templateText,setTemplateText]=useState('');
  const [ruleName,setRuleName]=useState(''),[keywords,setKeywords]=useState(''),[ruleReply,setRuleReply]=useState(''),[rulePlatform,setRulePlatform]=useState<Platform>('FACEBOOK');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const base='/brands/'+encodeURIComponent(brandId);
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{const [result,t,r]=await Promise.all([browserApi.request<{items:SocialComment[]}>(base+'/comments'),browserApi.request<ReplyTemplate[]>(base+'/reply-templates'),browserApi.request<AutomationRule[]>(base+'/automation-rules')]);setComments(result.items);setTemplates(t);setRules(r)}
    catch{setError('Không thể tải hộp thư. Kiểm tra kết nối và thử lại.')}finally{setLoading(false)}
  },[base]);
  useEffect(()=>{void load()},[load]);
  const current=comments.find(comment=>comment.id===selected);
  async function action(path:string,body?:unknown){
    if(!current)return;
    setBusy(true);setError('');setNotice('');
    try{const changed=await browserApi.request<SocialComment>(base+'/comments/'+encodeURIComponent(current.id)+'/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body??{})});setComments(rows=>rows.map(row=>row.id===changed.id?changed:row));setNotice(path==='reply'?'Đã trả lời':path==='private-reply'?'Đã nhắn riêng':'Đã cập nhật');if(path==='reply'||path==='private-reply')setText('')}
    catch{setError('Thao tác không thành công. Kiểm tra quyền kết nối nền tảng và thử lại.')}finally{setBusy(false)}
  }
  async function createTemplate(){
    setBusy(true);setError('');try{const saved=await browserApi.request<ReplyTemplate>(base+'/reply-templates',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:templateName,text:templateText})});setTemplates(rows=>[...rows,saved]);setTemplateName('');setTemplateText('');setNotice('Đã lưu mẫu câu')}
    catch{setError('Không thể lưu mẫu câu.')}finally{setBusy(false)}
  }
  async function createRule(){
    setBusy(true);setError('');try{const saved=await browserApi.request<AutomationRule>(base+'/automation-rules',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:ruleName,platforms:[rulePlatform],match:{keywords:keywords.split(',').map(item=>item.trim()).filter(Boolean),mode:'ANY'},actions:{reply:ruleReply},maxPerHour:30})});setRules(rows=>[...rows,saved]);setRuleName('');setKeywords('');setRuleReply('');setNotice('Đã tạo quy tắc ở trạng thái tắt. Bật khi sẵn sàng.')}
    catch{setError('Không thể tạo quy tắc. Kiểm tra tên, từ khóa và nội dung trả lời.')}finally{setBusy(false)}
  }
  async function toggleRule(rule:AutomationRule){
    setBusy(true);setError('');try{const changed=await browserApi.request<AutomationRule>(base+'/automation-rules/'+encodeURIComponent(rule.id),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...rule,enabled:!rule.enabled})});setRules(rows=>rows.map(row=>row.id===changed.id?changed:row))}
    catch{setError('Không thể đổi trạng thái quy tắc.')}finally{setBusy(false)}
  }
  async function removeResource(kind:'reply-templates'|'automation-rules',resourceId:string){
    setBusy(true);setError('');try{await browserApi.request(base+'/'+kind+'/'+encodeURIComponent(resourceId),{method:'DELETE'});if(kind==='reply-templates')setTemplates(rows=>rows.filter(row=>row.id!==resourceId));else setRules(rows=>rows.filter(row=>row.id!==resourceId))}
    catch{setError('Không thể xóa.')}finally{setBusy(false)}
  }
  const filtered=comments.filter(row=>(!status||row.status===status)&&(!platform||row.platform===platform));
  return <div className="section-stack"><PageHeader title="Hộp thư" description="Xem bình luận, trả lời và thiết lập phản hồi theo từ khóa." actions={<button className="ui-button ui-button--secondary" onClick={()=>void load()} disabled={busy}>Làm mới</button>}/>
    <div className="row-actions" role="tablist" aria-label="Mục hộp thư"><button className="ui-button ui-button--secondary" role="tab" aria-selected={view==='comments'} onClick={()=>setView('comments')}>Bình luận</button><button className="ui-button ui-button--secondary" role="tab" aria-selected={view==='templates'} onClick={()=>setView('templates')}>Mẫu câu</button><button className="ui-button ui-button--secondary" role="tab" aria-selected={view==='rules'} onClick={()=>setView('rules')}>Quy tắc</button></div>
    {loading?<LoadingState label="Đang tải hộp thư..."/>:null}{error?<ErrorState message={error}/>:null}{notice?<p role="status" className="feedback">{notice}</p>:null}
    {view==='comments'&&!loading?<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:16}}><Card><h2>Bình luận</h2><div className="row-actions"><label className="field">Trạng thái<select aria-label="Lọc trạng thái" value={status} onChange={event=>setStatus(event.target.value)}><option value="">Tất cả</option>{Object.entries(statuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="field">Nền tảng<select aria-label="Lọc nền tảng" value={platform} onChange={event=>setPlatform(event.target.value)}><option value="">Tất cả</option>{platforms.map(item=><option key={item}>{item}</option>)}</select></label></div><div className="panel-list">{filtered.length?filtered.map(row=><button type="button" className="panel-list__item" key={row.id} onClick={()=>{setSelected(row.id);setText('');setTemplateId('')}} aria-pressed={selected===row.id} style={{width:'100%',textAlign:'left',cursor:'pointer'}}><span><strong>{row.authorName}</strong><small>{row.platform} · {statuses[row.status]} · {new Date(row.createdAt).toLocaleString('vi-VN')}</small><span>{row.text}</span></span></button>):<p>Chưa có bình luận. Hãy kết nối Trang và cấu hình webhook Meta.</p>}</div></Card>
      <Card>{current?<><h2>Trả lời {current.authorName}</h2><p>{current.text}</p><p>Trạng thái: <strong>{statuses[current.status]}</strong></p><label className="field">Mẫu câu<select aria-label="Mẫu câu" value={templateId} onChange={event=>{const id=event.target.value;setTemplateId(id);const template=templates.find(row=>row.id===id);if(template)setText(renderTemplate(template.text,{authorName:current.authorName}))}}><option value="">Chọn mẫu câu</option>{templates.map(template=><option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label className="field">Nội dung trả lời<textarea aria-label="Nội dung trả lời" value={text} onChange={event=>setText(event.target.value)} rows={4}/></label><div className="row-actions"><button className="ui-button ui-button--primary" disabled={busy||!text.trim()||current.status==='DELETED'} onClick={()=>void action('reply',{text})}>Gửi trả lời</button><button className="ui-button ui-button--secondary" disabled={busy||!text.trim()||current.privateReplySentAt!==undefined||Date.now()-current.createdAt>=7*86_400_000||!['FACEBOOK','INSTAGRAM'].includes(current.platform)} title="Một lần trong 7 ngày từ khi bình luận" onClick={()=>void action('private-reply',{text})}>Nhắn riêng</button><button className="ui-button ui-button--secondary" disabled={busy||!['FACEBOOK','INSTAGRAM'].includes(current.platform)} onClick={()=>void action(current.status==='HIDDEN'?'unhide':'hide')}>{current.status==='HIDDEN'?'Bỏ ẩn':'Ẩn'}</button><button className="ui-button ui-button--ghost" disabled={busy} onClick={()=>void action('read')}>Đánh dấu đã đọc</button></div>{current.platform==='YOUTUBE'?<p>Ẩn bình luận chưa được YouTube hỗ trợ.</p>:null}</>:<p>Chọn một bình luận để xử lý.</p>}</Card></div>:null}
    {view==='templates'&&!loading?<Card><h2>Mẫu câu trả lời</h2><div className="panel-list">{templates.map(template=><div className="panel-list__item" key={template.id}><div><strong>{template.name}</strong><small>{template.text}</small></div><button className="ui-button ui-button--danger" disabled={busy} onClick={()=>void removeResource('reply-templates',template.id)}>Xóa</button></div>)}</div><form className="form-grid" onSubmit={event=>{event.preventDefault();void createTemplate()}}><label className="field">Tên mẫu<input required value={templateName} onChange={event=>setTemplateName(event.target.value)}/></label><label className="field field--wide">Nội dung<textarea required value={templateText} onChange={event=>setTemplateText(event.target.value)} placeholder="Chào {ten}, sản phẩm {sanpham}: {link}"/></label><button className="ui-button ui-button--primary" disabled={busy}>Lưu mẫu câu</button></form></Card>:null}
    {view==='rules'&&!loading?<Card><h2>Quy tắc tự động</h2><p>Quy tắc mới luôn tắt. Chỉ bật sau khi kiểm tra nội dung; tối đa 30 bình luận mỗi giờ cho một quy tắc.</p><div className="panel-list">{rules.map(rule=><div className="panel-list__item" key={rule.id}><div><strong>{rule.name}</strong><small>{rule.platforms.join(', ')} · {rule.match.keywords.join(', ')} · {rule.enabled?'Đang bật':'Đang tắt'}</small><span>{rule.actions.reply??rule.actions.privateReply??(rule.actions.hide?'Ẩn bình luận':'')}</span></div><div className="row-actions"><button className="ui-button ui-button--secondary" disabled={busy} onClick={()=>void toggleRule(rule)}>{rule.enabled?'Tắt':'Bật'}</button><button className="ui-button ui-button--danger" disabled={busy} onClick={()=>void removeResource('automation-rules',rule.id)}>Xóa</button></div></div>)}</div><form className="form-grid" onSubmit={event=>{event.preventDefault();void createRule()}}><label className="field">Tên quy tắc<input required value={ruleName} onChange={event=>setRuleName(event.target.value)}/></label><label className="field">Nền tảng<select value={rulePlatform} onChange={event=>setRulePlatform(event.target.value as Platform)}>{platforms.map(item=><option key={item}>{item}</option>)}</select></label><label className="field field--wide">Từ khóa, cách nhau bằng dấu phẩy<input required value={keywords} onChange={event=>setKeywords(event.target.value)}/></label><label className="field field--wide">Câu trả lời công khai<textarea required value={ruleReply} onChange={event=>setRuleReply(event.target.value)}/></label><button className="ui-button ui-button--primary" disabled={busy}>Tạo quy tắc</button></form></Card>:null}
  </div>;
}

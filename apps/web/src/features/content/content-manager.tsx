'use client';

import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {browserApi} from '../../lib/browser-runtime.ts';
import {uploadMediaAsset} from '../../lib/media-upload.ts';
import {formatDateTime} from '../../lib/ui/format.ts';
import {platformLabel,statusLabel,statusTone} from '../../lib/ui/status.ts';
import {Badge} from '../../components/ui/badge.tsx';
import {Button} from '../../components/ui/button.tsx';
import {Card} from '../../components/ui/card.tsx';
import {EmptyState,ErrorState,LoadingState} from '../../components/ui/page-state.tsx';
import {PageHeader} from '../../components/ui/page-header.tsx';
import {CONTENT_PLATFORMS,variantReadiness,type ContentVariantSnapshot} from './content-model.ts';

type ContentItem={id:string;title:string;type:string;status?:string;createdAt?:number;body?:string};
type Variant=ContentVariantSnapshot&{caption?:string;body?:string;hashtags?:string[];cta?:string};

export function ContentManager({brandId}:{brandId:string}){
  const [items,setItems]=useState<ContentItem[]>([]);
  const [variants,setVariants]=useState<Record<string,Variant[]|null>>({});
  const [expanded,setExpanded]=useState<Record<string,boolean>>({});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [showForm,setShowForm]=useState(false);
  const [query,setQuery]=useState('');
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  async function load(){
    setLoading(true);setError('');
    try{const rows=await browserApi.request<ContentItem[]>('/brands/'+brandId+'/content');setItems(rows);const loaded=await Promise.all(rows.map(async item=>{try{return [item.id,await browserApi.request<Variant[]>('/brands/'+brandId+'/content/'+item.id+'/variants')] as const}catch{return [item.id,null] as const}}));setVariants(Object.fromEntries(loaded))}
    catch{setError('Không thể tải thư viện nội dung. Vui lòng thử lại.')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[brandId]);
  const filtered=useMemo(()=>items.filter(item=>[item.title,item.type,item.status??''].some(value=>value.toLocaleLowerCase('vi-VN').includes(query.trim().toLocaleLowerCase('vi-VN')))),[items,query]);
  async function prepare(id:string){
    setError('');setSuccess('');
    try{
      const rows=await browserApi.request<Variant[]>('/brands/'+brandId+'/content/'+id+'/variants/copy',{method:'POST'});
      setVariants(current=>({...current,[id]:rows}));setExpanded(current=>({...current,[id]:true}));setSuccess('Đã tạo hoặc đồng bộ biến thể nền tảng.');
    }catch{setError('Không thể tạo biến thể. Vui lòng thử lại.')}
  }
  async function showVariants(id:string){
    setError('');
    try{
      const rows=await browserApi.request<Variant[]>('/brands/'+brandId+'/content/'+id+'/variants');
      setVariants(current=>({...current,[id]:rows}));setExpanded(current=>({...current,[id]:!current[id]}));
    }catch{setError('Không thể tải biến thể nội dung. Vui lòng thử lại.')}
  }
  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=event.currentTarget;const data=new FormData(form);setSaving(true);setError('');setSuccess('');
    const type=String(data.get('type')??'TEXT');
    try{
      const file=data.get('media');
      if((type==='IMAGE'||type==='VIDEO')&&(!(file instanceof File)||file.size===0)){setError('Hãy chọn tệp hình ảnh hoặc video trước khi tạo nội dung.');return;}
      let masterAssetId:string|undefined;
      if((type==='IMAGE'||type==='VIDEO')&&file instanceof File)masterAssetId=await uploadMediaAsset(browserApi,brandId,file);
      const payload={type,title:String(data.get('title')??'').trim(),...(String(data.get('body')??'').trim()?{body:String(data.get('body')).trim()}:{}),...(String(data.get('cta')??'').trim()?{cta:String(data.get('cta')).trim()}:{}),...(masterAssetId?{masterAssetId}:{})};
      const item=await browserApi.request<ContentItem>('/brands/'+brandId+'/content',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      form.reset();setShowForm(false);await load();await prepare(item.id);setSuccess('Đã tạo nội dung. Kiểm tra trạng thái từng biến thể trước khi đăng.');
    }catch{setError(type!=='TEXT'?'Không thể tạo nội dung hoặc tải media. Hãy kiểm tra loại tệp và thử lại.':'Không thể tạo nội dung. Vui lòng kiểm tra thông tin.')}
    finally{setSaving(false)}
  }
  async function update(contentId:string,variant:Variant,event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=event.currentTarget;const data=new FormData(form);setError('');setSuccess('');
    try{
      await browserApi.request('/brands/'+brandId+'/content/'+contentId+'/variants/'+variant.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({caption:String(data.get('caption')??''),body:String(data.get('body')??''),cta:String(data.get('cta')??''),status:String(data.get('status')??'DRAFT')})});
      const rows=await browserApi.request<Variant[]>('/brands/'+brandId+'/content/'+contentId+'/variants');setVariants(current=>({...current,[contentId]:rows}));setSuccess('Đã lưu biến thể '+platformLabel(variant.platform)+'.');
    }catch{setError('Không thể lưu biến thể. Vui lòng thử lại.')}
  }
  return <div className="section-stack">
    <PageHeader title="Nội dung" description="Tạo nội dung gốc, biên tập từng biến thể và kiểm tra trạng thái trước khi xuất bản." actions={<Button onClick={()=>setShowForm(value=>!value)}>{showForm?'Đóng biểu mẫu':'＋ Tạo nội dung'}</Button>}/>
    {error?<ErrorState message={error}/>:null}{success?<div className="feedback feedback--success" role="status">{success}</div>:null}
    {showForm?<Card className="form-panel"><h2>Tạo nội dung gốc</h2><form onSubmit={event=>void create(event)}>
      <div className="form-grid">
        <div className="field"><label htmlFor="content-type">Loại nội dung</label><select id="content-type" name="type" defaultValue="TEXT"><option value="TEXT">Văn bản</option><option value="IMAGE">Hình ảnh</option><option value="VIDEO">Video</option></select></div>
        <div className="field"><label htmlFor="content-title">Tiêu đề</label><input id="content-title" name="title" required placeholder="Tiêu đề nội dung"/></div>
        <div className="field field--wide"><label htmlFor="content-body">Nội dung gốc</label><textarea id="content-body" name="body" rows={4} placeholder="Viết nội dung chính..."/></div>
        <div className="field"><label htmlFor="content-cta">Lời kêu gọi hành động</label><input id="content-cta" name="cta" placeholder="Ví dụ: Tìm hiểu thêm"/></div>
        <div className="field"><label htmlFor="content-media">Tệp hình ảnh/video</label><input id="content-media" name="media" type="file" accept="image/*,video/*"/></div>
      </div>
      <div className="form-actions"><Button variant="ghost" type="button" onClick={()=>setShowForm(false)}>Hủy</Button><Button type="submit" disabled={saving}>{saving?'Đang tạo...':'Tạo nội dung'}</Button></div>
    </form></Card>:null}
    <Card>
      <div className="section-toolbar"><input className="section-toolbar__search" aria-label="Tìm nội dung" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Tìm tiêu đề hoặc loại nội dung..."/><Button variant="ghost" onClick={()=>void load()} disabled={loading}>Làm mới</Button></div>
      {loading?<LoadingState label="Đang tải nội dung..."/>:filtered.length===0?<EmptyState title={query?'Không tìm thấy nội dung':'Thư viện đang trống'} description={query?'Thử từ khóa khác.':'Tạo nội dung gốc để chuẩn bị các biến thể theo nền tảng.'}/>:<div className="section-stack">{filtered.map(item=>{
        const itemVariants=variants[item.id]??[];
        const variantsLoaded=Object.prototype.hasOwnProperty.call(variants,item.id)&&variants[item.id]!==null;
        const readiness=variantReadiness(itemVariants);
        return <article className="content-card" key={item.id}>
          <div className="content-card__top"><div><h2>{item.title}</h2><div className="content-card__meta">{item.type==='TEXT'?'Văn bản':item.type==='IMAGE'?'Hình ảnh':'Video'} · {statusLabel(item.status)}{item.createdAt?' · '+formatDateTime(item.createdAt):''}</div></div><Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge></div>
          {item.body?<p>{item.body}</p>:null}
          <div className="panel__header" style={{marginTop:16}}><h2>Biến thể nền tảng</h2><div className="row-actions"><Button variant="secondary" size="sm" onClick={()=>void showVariants(item.id)}>{expanded[item.id]?'Ẩn biến thể':'Chỉnh sửa biến thể'}</Button><Button size="sm" onClick={()=>void prepare(item.id)}>Tạo/đồng bộ 4 biến thể</Button></div></div>
          {variantsLoaded?<div className="platform-grid">{readiness.map(row=><div className="platform-tile" key={row.platform}><strong>{platformLabel(row.platform)}</strong><Badge tone={row.ready?'success':row.exists?'warning':'neutral'}>{row.ready?'Sẵn sàng':row.exists?'Bản nháp':'Chưa tạo'}</Badge></div>)}</div>:<p className="muted">Chưa tải trạng thái biến thể từ API. Chọn “Chỉnh sửa biến thể” để xem trạng thái thực tế.</p>}
          {expanded[item.id]?<div className="variant-grid">{itemVariants.map(variant=><form className="variant-card" key={variant.id} onSubmit={event=>void update(item.id,variant,event)}>
            <div className="variant-card__head"><strong>{platformLabel(variant.platform)}</strong><Badge tone={variant.status==='READY'?'success':'warning'}>{statusLabel(variant.status)}</Badge></div>
            <div className="field"><label htmlFor={'caption-'+variant.id}>Caption</label><textarea id={'caption-'+variant.id} name="caption" defaultValue={variant.caption??''}/></div>
            <div className="field"><label htmlFor={'body-'+variant.id}>Nội dung</label><textarea id={'body-'+variant.id} name="body" defaultValue={variant.body??''}/></div>
            <div className="field"><label htmlFor={'cta-'+variant.id}>CTA</label><input id={'cta-'+variant.id} name="cta" defaultValue={variant.cta??''}/></div>
            <div className="field"><label htmlFor={'status-'+variant.id}>Trạng thái</label><select id={'status-'+variant.id} name="status" defaultValue={variant.status==='READY'?'READY':'DRAFT'}><option value="DRAFT">Bản nháp</option><option value="READY">Sẵn sàng</option></select></div>
            <div className="form-actions"><Button type="submit" size="sm">Lưu biến thể</Button></div>
          </form>)}</div>:null}
        </article>;
      })}</div>}
    </Card>
  </div>;
}

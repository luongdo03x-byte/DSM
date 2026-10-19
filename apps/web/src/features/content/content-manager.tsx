'use client';

import {useEffect,useMemo,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {browserApi} from '../../lib/browser-runtime.ts';
import {uploadMediaAsset} from '../../lib/media-upload.ts';
import {formatDateTime} from '../../lib/ui/format.ts';
import {platformLabel,statusLabel,statusTone} from '../../lib/ui/status.ts';
import {Badge} from '../../components/ui/badge.tsx';
import {Button} from '../../components/ui/button.tsx';
import {Card} from '../../components/ui/card.tsx';
import {EmptyState,ErrorState,LoadingState} from '../../components/ui/page-state.tsx';
import {PageHeader} from '../../components/ui/page-header.tsx';
import {CONTENT_PLATFORMS,contentPreview,platformVariant,variantReadiness,type ContentPlatform,type ContentVariantSnapshot} from './content-model.ts';

type ContentItem={id:string;title:string;type:string;status?:string;createdAt?:number;body?:string};
type Variant=ContentVariantSnapshot&{caption?:string;body?:string;hashtags?:string[];cta?:string};

export function ContentManager({brandId}:{brandId:string}){
  const [items,setItems]=useState<ContentItem[]>([]);
  const [variants,setVariants]=useState<Record<string,Variant[]|null>>({});
  const [selectedId,setSelectedId]=useState('');
  const [activePlatform,setActivePlatform]=useState<ContentPlatform>('FACEBOOK');
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
  const selected=filtered.find(item=>item.id===selectedId)??filtered[0];
  const selectedVariants=selected?(variants[selected.id]??[]):[];
  const variantsLoaded=!!selected&&Object.prototype.hasOwnProperty.call(variants,selected.id)&&variants[selected.id]!==null;
  const readiness=variantReadiness(selectedVariants);
  const activeVariant=platformVariant(selectedVariants,activePlatform);
  const preview=selected?contentPreview(selected,selectedVariants,activePlatform):null;
  async function prepare(id:string){
    setError('');setSuccess('');setSaving(true);
    try{
      const rows=await browserApi.request<Variant[]>('/brands/'+brandId+'/content/'+id+'/variants/copy',{method:'POST'});
      setVariants(current=>({...current,[id]:rows}));setSuccess('Đã tạo hoặc đồng bộ biến thể nền tảng.');
    }catch{setError('Không thể tạo biến thể. Vui lòng thử lại.')}
    finally{setSaving(false)}
  }
  async function showVariants(id:string){
    setError('');setSaving(true);
    try{
      const rows=await browserApi.request<Variant[]>('/brands/'+brandId+'/content/'+id+'/variants');
      setVariants(current=>({...current,[id]:rows}));
    }catch{setError('Không thể tải biến thể nội dung. Vui lòng thử lại.')}
    finally{setSaving(false)}
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
      form.reset();setShowForm(false);setSelectedId(item.id);setActivePlatform('FACEBOOK');await load();await prepare(item.id);setSuccess('Đã tạo nội dung. Kiểm tra trạng thái từng biến thể trước khi đăng.');
    }catch{setError(type!=='TEXT'?'Không thể tạo nội dung hoặc tải media. Hãy kiểm tra loại tệp và thử lại.':'Không thể tạo nội dung. Vui lòng kiểm tra thông tin.')}
    finally{setSaving(false)}
  }
  async function update(contentId:string,variant:Variant,event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=event.currentTarget;const data=new FormData(form);setError('');setSuccess('');setSaving(true);
    try{
      await browserApi.request('/brands/'+brandId+'/content/'+contentId+'/variants/'+variant.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({caption:String(data.get('caption')??''),body:String(data.get('body')??''),cta:String(data.get('cta')??''),status:String(data.get('status')??'DRAFT')})});
      const rows=await browserApi.request<Variant[]>('/brands/'+brandId+'/content/'+contentId+'/variants');setVariants(current=>({...current,[contentId]:rows}));setSuccess('Đã lưu biến thể '+platformLabel(variant.platform)+'.');
    }catch{setError('Không thể lưu biến thể. Vui lòng thử lại.')}
    finally{setSaving(false)}
  }
  return <div className="section-stack">
    <PageHeader title="Nội dung" description="Tạo nội dung gốc, biên tập từng biến thể và kiểm tra trạng thái trước khi xuất bản." actions={<Link className="ui-button ui-button--primary" href={'/app/brands/'+brandId+'/compose'}>Tạo bài</Link>}/>
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
    <div className="studio-grid">
      <Card className="studio-library">
        <div className="panel__header"><h2>Thư viện nội dung</h2><Badge tone="info">{filtered.length} nội dung</Badge></div>
        <div className="section-toolbar">
          <input className="section-toolbar__search" aria-label="Tìm nội dung" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Tìm nội dung..."/>
          <Button variant="ghost" size="sm" type="button" onClick={()=>void load()} disabled={loading}>Làm mới</Button>
        </div>
        {loading?<LoadingState label="Đang tải nội dung..."/>:filtered.length===0?
          <EmptyState title={query?'Không tìm thấy nội dung':'Thư viện đang trống'} description={query?'Thử từ khóa khác.':'Tạo nội dung gốc để bắt đầu.'}/>:
          <div className="studio-library__list" role="group" aria-label="Chọn nội dung để biên tập">{filtered.map(item=>
            <button type="button" className={'studio-library__item'+(selected?.id===item.id?' studio-library__item--active':'')} key={item.id} aria-pressed={selected?.id===item.id} onClick={()=>{setSelectedId(item.id);setError('');setSuccess('')}}>
              <strong>{item.title}</strong>
              <span>{item.type==='TEXT'?'Văn bản':item.type==='IMAGE'?'Hình ảnh':'Video'} · {statusLabel(item.status)}</span>
            </button>)}</div>}
      </Card>
      <Card className="studio-editor">
        {!selected?<EmptyState title="Chọn một nội dung" description="Chọn nội dung trong thư viện để biên tập các biến thể."/>:
          <>
            <div className="content-card__top">
              <div>
                <h2>{selected.title}</h2>
                <div className="content-card__meta">{selected.type==='TEXT'?'Văn bản':selected.type==='IMAGE'?'Hình ảnh':'Video'}{selected.createdAt?' · '+formatDateTime(selected.createdAt):''}</div>
              </div>
              <Badge tone={statusTone(selected.status)}>{statusLabel(selected.status)}</Badge>
            </div>
            <Link className="ui-button ui-button--secondary" href={'/app/brands/'+brandId+'/compose/'+selected.id}>Sửa trong Composer</Link>
            <div className="studio-master">
              <strong>Nội dung gốc</strong>
              <p>{selected.body?.trim()||'Chưa có phần nội dung gốc.'}</p>
            </div>
            <div className="panel__header">
              <h2>Biến thể nền tảng</h2>
              <div className="row-actions">
                <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={()=>void showVariants(selected.id)}>Tải lại</Button>
                <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={()=>void prepare(selected.id)}>Tạo/đồng bộ 4 biến thể</Button>
              </div>
            </div>
            <div className="studio-platform-tabs" role="tablist" aria-label="Chọn nền tảng để biên tập">
              {CONTENT_PLATFORMS.map(platform=>
                <button type="button" key={platform} role="tab" aria-selected={activePlatform===platform} onClick={()=>setActivePlatform(platform)}>
                  {platformLabel(platform)}
                  {variantsLoaded&&platformVariant(selectedVariants,platform)?.status==='READY'?<span aria-label="Sẵn sàng"> ✓</span>:null}
                </button>)}
            </div>
            {!variantsLoaded?<EmptyState title="Chưa xác minh được biến thể" description="Không thể tải trạng thái biến thể. Chọn Tải lại để kiểm tra từ API."/>:
              !activeVariant?<EmptyState title={'Chưa có biến thể '+platformLabel(activePlatform)} description="Chọn “Tạo/đồng bộ 4 biến thể” trước khi chỉnh sửa."/>:
              <form className="studio-variant-form" key={activeVariant.id} onSubmit={event=>void update(selected.id,activeVariant,event)}>
                <div className="variant-card__head"><strong>{platformLabel(activePlatform)}</strong><Badge tone={activeVariant.status==='READY'?'success':'warning'}>{statusLabel(activeVariant.status)}</Badge></div>
                <div className="field"><label htmlFor={'caption-'+activeVariant.id}>Caption</label><textarea id={'caption-'+activeVariant.id} name="caption" defaultValue={activeVariant.caption??''} rows={4}/></div>
                <div className="field"><label htmlFor={'body-'+activeVariant.id}>Nội dung</label><textarea id={'body-'+activeVariant.id} name="body" defaultValue={activeVariant.body??''} rows={5}/></div>
                <div className="field"><label htmlFor={'cta-'+activeVariant.id}>Lời kêu gọi hành động</label><input id={'cta-'+activeVariant.id} name="cta" defaultValue={activeVariant.cta??''}/></div>
                <div className="field"><label htmlFor={'status-'+activeVariant.id}>Trạng thái</label><select id={'status-'+activeVariant.id} name="status" defaultValue={activeVariant.status==='READY'?'READY':'DRAFT'}><option value="DRAFT">Bản nháp</option><option value="READY">Sẵn sàng</option></select></div>
                <div className="form-actions"><Button type="submit" disabled={saving}>{saving?'Đang lưu...':'Lưu biến thể'}</Button></div>
              </form>}
          </>}
      </Card>
      <Card className="studio-preview">
        <div className="panel__header"><h2>Xem trước & sẵn sàng</h2></div>
        {!selected?<EmptyState title="Chưa chọn nội dung"/>:
          <>
            <div className="studio-preview__frame">
              <div className="studio-preview__platform">{platformLabel(activePlatform)} · Bản xem trước</div>
              <strong>{selected.title}</strong>
              <p>{preview?.text||'Chưa có nội dung để xem trước.'}</p>
              {selected.type!=='TEXT'?<span className="muted">Xem trước media chưa khả dụng trong phiên bản này.</span>:null}
            </div>
            <p className="muted">Bản xem trước chỉ mô phỏng nội dung, không phải giao diện chính thức của nền tảng.</p>
            <h3 className="studio-preview__heading">Điều kiện biến thể</h3>
            {variantsLoaded?<div className="studio-readiness">{readiness.map(row=>
              <div className="studio-readiness__item" key={row.platform}>
                <strong>{platformLabel(row.platform)}</strong>
                <Badge tone={row.ready?'success':row.exists?'warning':'neutral'}>{row.ready?'Sẵn sàng':row.exists?'Bản nháp':'Chưa tạo'}</Badge>
              </div>)}</div>:
              <p className="muted">Chưa xác minh được trạng thái từ API. Không thể kết luận sẵn sàng đăng.</p>}
            <a className="ui-button ui-button--primary studio-publish-link" href="#dsm-publish">Đi tới kiểm tra & đăng bài</a>
          </>}
      </Card>
    </div>
  </div>;
}

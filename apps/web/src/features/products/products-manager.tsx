'use client';

import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {browserApi} from '../../lib/browser-runtime.ts';
import {formatCurrency,formatMetric} from '../../lib/ui/format.ts';
import {statusLabel,statusTone} from '../../lib/ui/status.ts';
import {Badge} from '../../components/ui/badge.tsx';
import {Button} from '../../components/ui/button.tsx';
import {Card} from '../../components/ui/card.tsx';
import {EmptyState,ErrorState,LoadingState} from '../../components/ui/page-state.tsx';
import {PageHeader} from '../../components/ui/page-header.tsx';
import {StatCard} from '../../components/ui/stat-card.tsx';
import {filterProducts,productMargin,productStats,type ProductSnapshot} from './product-model.ts';

type Product=ProductSnapshot&{currency?:string; supplierUrl?:string; landingUrl?:string};

export function ProductsManager({brandId}:{brandId:string}){
  const [items,setItems]=useState<Product[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [showForm,setShowForm]=useState(false);
  const [query,setQuery]=useState('');
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  async function load(){
    setLoading(true);setError('');
    try{setItems(await browserApi.request<Product[]>('/brands/'+brandId+'/products'))}
    catch(e){setError(e instanceof Error&&e.message==='UNAUTHORIZED'?'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.':'Không thể tải danh sách sản phẩm. Vui lòng thử lại.')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[brandId]);
  const filtered=useMemo(()=>filterProducts(items,query),[items,query]);
  const stats=useMemo(()=>productStats(items),[items]);
  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=event.currentTarget;const data=new FormData(form);setSaving(true);setError('');setSuccess('');
    const payload={
      name:String(data.get('name')??'').trim(),slug:String(data.get('slug')??'').trim(),currency:String(data.get('currency')??'VND').trim().toUpperCase(),
      ...(String(data.get('description')??'').trim()?{description:String(data.get('description')).trim()}:{}),
      ...(String(data.get('cost')??'').trim()?{cost:String(data.get('cost')).trim()}:{}),
      ...(String(data.get('sellingPrice')??'').trim()?{sellingPrice:String(data.get('sellingPrice')).trim()}:{}),
      ...(String(data.get('supplierUrl')??'').trim()?{supplierUrl:String(data.get('supplierUrl')).trim()}:{}),
      ...(String(data.get('landingUrl')??'').trim()?{landingUrl:String(data.get('landingUrl')).trim()}:{}),status:'ACTIVE'
    };
    try{
      await browserApi.request('/brands/'+brandId+'/products',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      form.reset();setShowForm(false);setSuccess('Đã tạo sản phẩm.');await load();
    }catch(e){setError(e instanceof Error&&e.message==='INVALID_MONEY'?'Giá vốn và giá bán phải là số không âm, tối đa 4 chữ số thập phân.':e instanceof Error&&e.message==='INVALID_URL'?'URL nhà cung cấp và trang đích phải hợp lệ.':'Không thể tạo sản phẩm. Vui lòng kiểm tra thông tin và thử lại.')}
    finally{setSaving(false)}
  }
  async function archive(product:Product){
    if(!window.confirm('Lưu trữ sản phẩm “'+product.name+'”? Sản phẩm sẽ không còn xuất hiện trong danh sách đang hoạt động.'))return;
    setError('');setSuccess('');
    try{await browserApi.request('/brands/'+brandId+'/products/'+product.id+'/archive',{method:'POST'});setSuccess('Đã lưu trữ sản phẩm.');await load()}
    catch{setError('Không thể lưu trữ sản phẩm. Vui lòng thử lại.')}
  }
  return <div className="section-stack">
    <PageHeader title="Sản phẩm" description="Quản lý thông tin sản phẩm dùng trong nội dung và chiến dịch." actions={<Button onClick={()=>setShowForm(value=>!value)}>{showForm?'Đóng biểu mẫu':'＋ Tạo sản phẩm'}</Button>}/>
    {error?<ErrorState message={error}/>:null}{success?<div className="feedback feedback--success" role="status">{success}</div>:null}
    {showForm?<Card className="form-panel"><h2>Tạo sản phẩm mới</h2><form onSubmit={event=>void create(event)}>
      <div className="form-grid">
        <div className="field"><label htmlFor="product-name">Tên sản phẩm</label><input id="product-name" name="name" placeholder="Ví dụ: Áo linen" required/></div>
        <div className="field"><label htmlFor="product-slug">Slug</label><input id="product-slug" name="slug" placeholder="ao-linen" required/></div>
        <div className="field"><label htmlFor="product-currency">Tiền tệ</label><select id="product-currency" name="currency" defaultValue="VND"><option value="VND">VND — Đồng Việt Nam</option><option value="USD">USD — Đô la Mỹ</option><option value="EUR">EUR — Euro</option></select></div>
        <div className="field"><label htmlFor="product-cost">Giá vốn</label><input id="product-cost" name="cost" type="number" min="0" step="0.0001" placeholder="0"/></div>
        <div className="field"><label htmlFor="product-price">Giá bán</label><input id="product-price" name="sellingPrice" type="number" min="0" step="0.0001" placeholder="0"/></div>
        <div className="field"><label htmlFor="product-supplier">URL nhà cung cấp</label><input id="product-supplier" name="supplierUrl" type="url" placeholder="https://..."/></div>
        <div className="field field--wide"><label htmlFor="product-landing">URL trang đích</label><input id="product-landing" name="landingUrl" type="url" placeholder="https://..."/></div>
        <div className="field field--wide"><label htmlFor="product-description">Mô tả</label><textarea id="product-description" name="description" rows={3} placeholder="Mô tả ngắn về sản phẩm"/></div>
      </div>
      <div className="form-actions"><Button variant="ghost" type="button" onClick={()=>setShowForm(false)}>Hủy</Button><Button type="submit" disabled={saving}>{saving?'Đang lưu...':'Lưu sản phẩm'}</Button></div>
    </form></Card>:null}
    <div className="stats-grid">
      <StatCard label="Tổng sản phẩm" value={formatMetric(stats.total)}/>
      <StatCard label="Đang hoạt động" value={formatMetric(stats.active)}/>
      <StatCard label="Bản nháp" value={formatMetric(stats.draft)}/>
      <StatCard label="Đã lưu trữ" value={formatMetric(stats.archived)}/>
    </div>
    <Card>
      <div className="section-toolbar"><input className="section-toolbar__search" aria-label="Tìm sản phẩm" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Tìm theo tên, slug, mô tả..."/><span className="muted">{filtered.length} sản phẩm</span><Button variant="ghost" onClick={()=>void load()} disabled={loading}>Làm mới</Button></div>
      {loading?<LoadingState label="Đang tải sản phẩm..."/>:filtered.length===0?<EmptyState title={query?'Không tìm thấy sản phẩm':'Chưa có sản phẩm'} description={query?'Thử từ khóa khác.':'Tạo sản phẩm đầu tiên để bắt đầu quản lý nội dung.'}/>:<div className="data-table-wrap"><table className="data-table"><thead><tr><th>Sản phẩm</th><th>Giá vốn</th><th>Giá bán</th><th>Biên lợi nhuận</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{filtered.map(product=>{
        const margin=productMargin(product.cost,product.sellingPrice);
        return <tr key={product.id}><td className="product-name"><strong>{product.name}</strong><small>{product.slug??product.id}</small></td><td>{formatCurrency(product.cost===null?null:product.cost===undefined?null:Number(product.cost),product.currency??'VND')}</td><td>{formatCurrency(product.sellingPrice===null?null:product.sellingPrice===undefined?null:Number(product.sellingPrice),product.currency??'VND')}</td><td>{margin===null?'—':margin.toFixed(1)+'%'}</td><td><Badge tone={statusTone(product.status)}>{statusLabel(product.status)}</Badge></td><td><div className="row-actions">{product.status!=='ARCHIVED'?<Button variant="ghost" size="sm" onClick={()=>void archive(product)}>Lưu trữ</Button>:'—'}</div></td></tr>;
      })}</tbody></table></div>}
    </Card>
  </div>;
}

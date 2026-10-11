import {Badge} from '../../components/ui/badge.tsx';
import {Button} from '../../components/ui/button.tsx';
import {EmptyState} from '../../components/ui/page-state.tsx';
import {formatCurrency} from '../../lib/ui/format.ts';
import {statusLabel,statusTone} from '../../lib/ui/status.ts';

export function ProductList({products,onArchive}:{products:Array<{id:string;name:string;slug?:string;cost?:string;sellingPrice?:string;currency?:string;status:string}>;onArchive?:(id:string)=>void}){
  if(!products.length)return <EmptyState title="Chưa có sản phẩm" description="Tạo sản phẩm để bắt đầu quản lý nội dung."/>; 
  return <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Sản phẩm</th><th>Giá vốn</th><th>Giá bán</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{products.map(product=><tr key={product.id}><td><strong>{product.name}</strong><small>{product.slug??product.id}</small></td><td>{formatCurrency(product.cost?Number(product.cost):null,product.currency??'VND')}</td><td>{formatCurrency(product.sellingPrice?Number(product.sellingPrice):null,product.currency??'VND')}</td><td><Badge tone={statusTone(product.status)}>{statusLabel(product.status)}</Badge></td><td>{product.status!=='ARCHIVED'&&onArchive?<Button variant="ghost" size="sm" onClick={()=>onArchive(product.id)}>Lưu trữ</Button>:'—'}</td></tr>)}</tbody></table></div>;
}

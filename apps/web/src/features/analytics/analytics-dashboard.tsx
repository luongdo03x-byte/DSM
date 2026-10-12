'use client';
import {useEffect,useState} from 'react';
import {browserApi} from '../../lib/browser-runtime.ts';
import {formatMetric} from '../../lib/ui/format.ts';
import {platformLabel} from '../../lib/ui/status.ts';
import {Badge} from '../../components/ui/badge.tsx';
import {Button} from '../../components/ui/button.tsx';
import {Card} from '../../components/ui/card.tsx';
import {EmptyState,ErrorState,LoadingState} from '../../components/ui/page-state.tsx';
import {PageHeader} from '../../components/ui/page-header.tsx';
import {StatCard} from '../../components/ui/stat-card.tsx';
import {buildAnalyticsModel,type AnalyticsSnapshot,type PlatformSnapshot} from './analytics-model.ts';
export function AnalyticsDashboard({brandId}:{brandId:string}){
 const [model,setModel]=useState<ReturnType<typeof buildAnalyticsModel>|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 async function load(){setLoading(true);setError('');try{const [overview,platforms]=await Promise.all([browserApi.request<AnalyticsSnapshot>('/brands/'+brandId+'/analytics/overview'),browserApi.request<PlatformSnapshot[]>('/brands/'+brandId+'/analytics/platforms')]);setModel(buildAnalyticsModel(overview,platforms))}catch{setError('Không thể tải dữ liệu phân tích. Vui lòng thử lại.')}finally{setLoading(false)}}
 useEffect(()=>{void load()},[brandId]);
 if(loading)return <LoadingState label="Đang tải số liệu phân tích..."/>;if(error)return <ErrorState message={error}/>;if(!model)return <EmptyState title="Chưa có dữ liệu phân tích"/>;
 const s=model.summary;
 return <div className="section-stack"><PageHeader title="Phân tích" description="Tổng hợp số liệu đo lường hiện có từ các bài đã xuất bản." actions={<Button variant="secondary" onClick={()=>void load()}>Làm mới</Button>}/><div className="stats-grid"><StatCard label="Bài đã đăng" value={formatMetric(s.posts)}/><StatCard label="Lượt xem" value={formatMetric(s.views)}/><StatCard label="Lượt nhấp" value={formatMetric(s.clicks)}/><StatCard label="Tỷ lệ nhấp (CTR)" value={s.ctr===null?'—':s.ctr.toFixed(2)+'%'}/></div>
 <Card><div className="panel__header"><h2>Hiệu suất theo nền tảng</h2><Badge tone={model.platforms.length?'info':'neutral'}>{model.platforms.length} nền tảng</Badge></div>{!model.platforms.length?<EmptyState title="Chưa có số liệu nền tảng" description="Bảng sẽ được cập nhật khi API có dữ liệu đo lường. Không tạo biểu đồ giả khi chưa có chuỗi dữ liệu."/>:<div className="data-table-wrap"><table className="data-table"><thead><tr><th>Nền tảng</th><th>Bài đăng</th><th>Lượt xem</th><th>Lượt nhấp</th><th>CTR</th><th>Tỷ trọng lượt xem</th></tr></thead><tbody>{model.platforms.map(row=>{const share=s.views>0?row.views/s.views*100:null;return <tr key={row.platform}><td><strong>{platformLabel(row.platform)}</strong></td><td>{formatMetric(row.posts)}</td><td>{formatMetric(row.views)}</td><td>{formatMetric(row.clicks)}</td><td>{row.ctr===null?'—':row.ctr.toFixed(2)+'%'}</td><td>{share===null?'—':share.toFixed(1)+'%'}</td></tr>})}</tbody></table></div>}{!model.hasData?<div className="feedback" role="status">Hiện chưa có dữ liệu đo lường được ghi nhận.</div>:null}</Card>
 <Card><h2 className="panel-title">Cách đọc số liệu</h2><p className="muted">CTR được tính từ lượt nhấp và lượt xem khi mẫu số hợp lệ. Khi API chưa có mẫu số hoặc chưa ghi nhận số liệu, DSM hiển thị “—” thay vì NaN hoặc Infinity.</p></Card></div>;
}

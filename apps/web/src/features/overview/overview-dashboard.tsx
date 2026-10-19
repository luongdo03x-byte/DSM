'use client';

import {useEffect,useState} from 'react';
import {browserApi} from '../../lib/browser-runtime.ts';
import {formatDateTime,formatMetric} from '../../lib/ui/format.ts';
import {Badge} from '../../components/ui/badge.tsx';
import {Button} from '../../components/ui/button.tsx';
import {Card} from '../../components/ui/card.tsx';
import {EmptyState,ErrorState,LoadingState} from '../../components/ui/page-state.tsx';
import {PageHeader} from '../../components/ui/page-header.tsx';
import {StatCard} from '../../components/ui/stat-card.tsx';
import {buildOverviewModel} from './overview-model.ts';

export function OverviewDashboard({brandId}:{brandId:string}){
  const [model,setModel]=useState<ReturnType<typeof buildOverviewModel>|null>(null);
  const [reliability,setReliability]=useState<{published:number;failedPlatform:number;failedUser:number;successRate:number|null}|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  async function load(){
    setLoading(true);setError('');
    try{
      const [analytics,accounts,jobs,rate]=await Promise.all([
        browserApi.request<any>('/brands/'+brandId+'/analytics/overview'),
        browserApi.request<any[]>('/brands/'+brandId+'/accounts'),
        browserApi.request<any[]>('/brands/'+brandId+'/calendar'),
        browserApi.request<{published:number;failedPlatform:number;failedUser:number;successRate:number|null}>('/brands/'+brandId+'/analytics/reliability?days=28')
      ]);
      setModel(buildOverviewModel({analytics,accounts,jobs}));setReliability(rate);
    }catch(e){
      setError(e instanceof Error&&e.message==='UNAUTHORIZED'?'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.':'Không thể tải tổng quan. Vui lòng thử lại.');
    }finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[brandId]);
  if(loading)return <LoadingState label="Đang tải bảng tổng quan..."/>;
  if(error)return <ErrorState message={error}/>;
  if(!model)return <EmptyState title="Chưa có dữ liệu tổng quan" description="Dữ liệu sẽ xuất hiện khi thương hiệu có hoạt động."/>;
  const k=model.kpis;
  return <div className="section-stack">
    <PageHeader title="Tổng quan" description="Theo dõi hoạt động xuất bản và tình trạng các kênh của thương hiệu." actions={<Button variant="secondary" onClick={()=>void load()}>Làm mới dữ liệu</Button>}/>
    <div className="stats-grid">
      <StatCard label="Bài đã đăng" value={formatMetric(k.publishedPosts)} detail="Bài đăng đã xuất bản"/>
      <StatCard label="Đã lên lịch" value={formatMetric(k.scheduledJobs)} detail="Công việc trong hàng đợi"/>
      <StatCard label="Tài khoản hoạt động" value={formatMetric(k.activeAccounts)} detail="Tài khoản có trạng thái kết nối"/>
      <StatCard label="Công việc lỗi" value={formatMetric(k.failedJobs)} detail={k.failedJobs?'Cần kiểm tra và thử lại':'Không có công việc lỗi'}/>
    </div>
    <Card><div className="panel__header"><h2>Tỉ lệ đăng thành công</h2><Badge tone={reliability?.successRate!==null&&reliability?.successRate!==undefined&&reliability.successRate>=0.98?'success':'neutral'}>{reliability?.successRate===null||reliability===null?'—':(reliability.successRate*100).toFixed(1)+'%'}</Badge></div><p className="muted">28 ngày gần đây · {reliability?.published??0} bài đã đăng · {reliability?.failedPlatform??0} lỗi nền tảng · {reliability?.failedUser??0} lỗi cần người dùng xử lý. Lỗi cần người dùng xử lý không tính vào tỉ lệ.</p></Card>
    <div className="overview-grid">
      <Card>
        <div className="panel__header"><h2>Tình trạng tài khoản</h2><Badge tone={k.activeAccounts?'success':'neutral'}>{k.activeAccounts} đang kết nối</Badge></div>
        {model.accountHealth.length===0?<EmptyState title="Chưa có tài khoản" description="Kết nối tài khoản mạng xã hội để bắt đầu xuất bản."/>:
          <div className="panel-list">{model.accountHealth.slice(0,8).map(account=><div className="panel-list__item" key={account.id}>
            <div><strong>{account.platform}</strong><small>{account.username} · Chế độ {account.mode}</small>{account.warning?<small>Chưa gắn hồ sơ trình duyệt</small>:null}</div>
            <Badge tone={account.connected&&!account.warning?'success':account.connected?'warning':'neutral'}>{account.status}</Badge>
          </div>)}</div>}
        <div className="form-actions"><a className="ui-button ui-button--secondary" href={'/app/brands/'+brandId+'/accounts'}>Quản lý tài khoản</a></div>
      </Card>
      <Card>
        <div className="panel__header"><h2>Lịch đăng hôm nay</h2><a className="muted" href={'/app/brands/'+brandId+'/calendar'}>Xem lịch</a></div>
        {model.todaySchedule.length===0?<EmptyState title="Hôm nay chưa có lịch đăng" description="Các công việc đã lên lịch sẽ hiển thị tại đây."/>:
          <div className="panel-list">{model.todaySchedule.map(job=><div className="panel-list__item" key={job.id}>
            <div><strong>{job.platform??'Nền tảng chưa xác định'}</strong><small>{formatDateTime(job.scheduledAt)}</small></div>
            <Badge tone={job.status==='FAILED'?'danger':job.status==='PUBLISHED'?'success':'warning'}>{job.statusLabel}</Badge>
          </div>)}</div>}
      </Card>
    </div>
    <Card>
      <div className="panel__header"><h2>Hiệu suất theo nền tảng</h2><span className="muted">Dữ liệu API hiện có</span></div>
      {model.platforms.length===0?<EmptyState title="Chưa có số liệu nền tảng" description="Không hiển thị biểu đồ giả khi chưa có dữ liệu."/>:
        <div className="platform-grid">{model.platforms.map(platform=><div className="platform-tile" key={platform.platform}>
          <strong>{platform.platform}</strong><span>{formatMetric(platform.posts)} bài đăng</span><span>{formatMetric(platform.views)} lượt xem · {formatMetric(platform.clicks)} lượt nhấp</span><span>CTR: {platform.ctr===null?'—':platform.ctr.toFixed(2)+'%'}</span>
        </div>)}</div>}
    </Card>
    <Card>
      <div className="panel__header"><h2>Công việc gần đây</h2><a className="muted" href={'/app/brands/'+brandId+'/calendar'}>Mở lịch đăng</a></div>
      {model.recentJobs.length===0?<EmptyState title="Chưa có công việc xuất bản" description="Tạo nội dung và lên lịch đăng để theo dõi tiến độ tại đây."/>:
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Nền tảng</th><th>Thời gian</th><th>Trạng thái</th><th>Chi tiết</th></tr></thead><tbody>{model.recentJobs.map(job=><tr key={job.id}>
          <td>{job.platform??'—'}</td><td>{formatDateTime(job.scheduledAt)}</td><td><Badge tone={job.status==='FAILED'?'danger':job.status==='PUBLISHED'?'success':job.status==='CANCELLED'?'neutral':'warning'}>{job.statusLabel}</Badge></td><td>{job.errorMessage??job.errorCode??'—'}</td>
        </tr>)}</tbody></table></div>}
    </Card>
  </div>;
}

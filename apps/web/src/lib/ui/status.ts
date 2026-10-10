export type StatusTone='neutral'|'success'|'warning'|'danger'|'info';

const STATUS_LABELS:Record<string,string>={
  PUBLISHED:'Đã đăng',PROCESSING:'Đang xử lý',RETRYING:'Đang thử lại',FAILED:'Thất bại',
  QUEUED:'Đang chờ',CANCELLED:'Đã hủy',DRAFT:'Bản nháp',READY:'Sẵn sàng',
  ACTIVE:'Hoạt động',ARCHIVED:'Đã lưu trữ',CONNECTED:'Đã kết nối',DISCONNECTED:'Đã ngắt kết nối'
};

export function statusLabel(status:string|null|undefined){return status?STATUS_LABELS[status]??status:'—'}

export function statusTone(status:string|null|undefined):StatusTone{
  if(['PUBLISHED','READY','ACTIVE','CONNECTED','ONLINE'].includes(status??''))return 'success';
  if(['FAILED','OFFLINE'].includes(status??''))return 'danger';
  if(['PROCESSING','RETRYING','QUEUED','DRAFT'].includes(status??''))return 'warning';
  if(['CANCELLED','ARCHIVED','DISCONNECTED'].includes(status??''))return 'neutral';
  return 'info';
}

export function platformLabel(platform:string|null|undefined){
  const value=(platform??'').toUpperCase();
  const labels:Record<string,string>={FACEBOOK:'Facebook',INSTAGRAM:'Instagram',THREADS:'Threads',TIKTOK:'TikTok'};
  return labels[value]??platform??'—';
}

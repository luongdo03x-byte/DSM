export function LoadingState({label='Đang tải dữ liệu...'}:{label?:string}){
  return <div className="page-state" role="status" aria-live="polite">{label}</div>;
}
export function EmptyState({title='Chưa có dữ liệu',description}:{title?:string;description?:string}){
  return <div className="page-state page-state--empty"><strong>{title}</strong>{description?<span>{description}</span>:null}</div>;
}
export function ErrorState({message='Không thể tải dữ liệu. Vui lòng thử lại.'}:{message?:string}){
  return <div className="page-state page-state--error" role="alert">{message}</div>;
}

import {Badge} from '../../components/ui/badge.tsx';
import {platformLabel,statusLabel,statusTone} from '../../lib/ui/status.ts';
export function AccountCard({platform,status,username,mode}:{platform:string;status:string;username?:string;mode:string}){return <article className="account-panel"><div className="account-panel__head"><h3>{platformLabel(platform)}</h3><Badge tone={statusTone(status)}>{statusLabel(status)}</Badge></div><p>{username??'Chưa đặt tên'}</p><p>{statusLabel(status)} · {mode==='BROWSER'?'Trình duyệt':mode==='HYBRID'?'Kết hợp':'API'}</p></article>}

import {Icon} from './ui/icon.tsx';
import {NAV_ITEMS,buildBrandHref} from '../lib/ui/navigation.ts';

export function AppShell({brandId,children}:{brandId:string;children:React.ReactNode}){
  return <div className="app-shell">
    <aside className="app-sidebar" aria-label="Điều hướng chính">
      <a className="app-brand" href={buildBrandHref(brandId,'overview')}>
        <span className="app-brand__mark">D</span>
        <span className="app-brand__text"><strong>DSM</strong><span>Social Dropship Manager</span></span>
      </a>
      <nav className="app-nav">
        {NAV_ITEMS.map(item=><a key={item.section} href={buildBrandHref(brandId,item.section)}>
          <Icon name={item.icon}/><span>{item.label}</span>
        </a>)}
      </nav>
    </aside>
    <main className="app-main">
      <header className="app-topbar">
        <div><div className="app-topbar__title">Không gian quản lý DSM</div><div className="app-topbar__meta">Thương hiệu: {brandId}</div></div>
        <div className="app-topbar__meta">Quản lý đa nền tảng</div>
      </header>
      <div className="app-content">{children}</div>
    </main>
  </div>;
}

'use client';

import {useState} from 'react';
import {usePathname} from 'next/navigation';
import {Icon} from './ui/icon.tsx';
import {NAV_ITEMS,buildBrandHref} from '../lib/ui/navigation.ts';

export function AppShell({brandId,children}:{brandId:string;children:React.ReactNode}){
  const pathname=usePathname();
  const [mobileOpen,setMobileOpen]=useState(false);
  const sidebarClass='app-sidebar'+(mobileOpen?' app-sidebar--open':'');
  return <div className="app-shell">
    {mobileOpen?<button className="app-nav__mobile-backdrop" aria-label="Đóng menu" onClick={()=>setMobileOpen(false)}/>:null}
    <aside className={sidebarClass} aria-label="Điều hướng chính">
      <a className="app-brand" href={buildBrandHref(brandId,'overview')} onClick={()=>setMobileOpen(false)}>
        <span className="app-brand__mark">D</span>
        <span className="app-brand__text"><strong>DSM</strong><span>Social Dropship Manager</span></span>
      </a>
      <nav className="app-nav">{NAV_ITEMS.map(item=>{
        const href=buildBrandHref(brandId,item.section);
        const active=pathname===href||pathname.startsWith(href+'/');
        return <a key={item.section} href={href} aria-current={active?'page':undefined} onClick={()=>setMobileOpen(false)}><Icon name={item.icon}/><span>{item.label}</span></a>;
      })}</nav>
    </aside>
    <main className="app-main">
      <header className="app-topbar">
        <button className="app-sidebar__mobile-toggle" onClick={()=>setMobileOpen(value=>!value)} aria-expanded={mobileOpen} aria-label="Mở menu điều hướng"><Icon name="menu"/></button>
        <div><div className="app-topbar__title">Không gian quản lý DSM</div><div className="app-topbar__meta">Thương hiệu: {brandId}</div></div>
        <div className="app-topbar__meta">Quản lý đa nền tảng</div>
      </header>
      <div className="app-content">{children}</div>
    </main>
  </div>;
}

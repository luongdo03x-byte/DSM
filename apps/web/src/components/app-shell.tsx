const sections=['Overview','Products','Content','Calendar','Campaigns','Accounts','Analytics','Settings'];
export function AppShell({brandId,children}:{brandId:string;children:any}){return <div className="app-shell"><aside><strong>Social Commerce</strong><nav>{sections.map(s=><a key={s} href={`/app/brands/${brandId}/${s.toLowerCase()}`}>{s}</a>)}</nav></aside><main>{children}</main></div>}

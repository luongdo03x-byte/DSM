import {notFound} from 'next/navigation';

type PublicBio={slug:string;title:string;links:{label:string;position:number;url:string}[]};
const apiBase=process.env.API_INTERNAL_URL??process.env.NEXT_PUBLIC_API_BASE_URL??'http://127.0.0.1:4000';

export default async function BioPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const response=await fetch(`${apiBase}/b/${encodeURIComponent(slug)}`,{cache:'no-store'}).catch(()=>null);
  if(!response?.ok)notFound();
  const page=await response.json() as PublicBio;
  return <main className="entry-page"><section className="entry-card" aria-label="Link trong bio">
    <span className="login-eyebrow">DSM</span><h1>{page.title}</h1>
    <div style={{display:'grid',gap:12,marginTop:24}}>{page.links.map(link=><a key={link.url} className="ui-button ui-button--primary" href={link.url}>{link.label}</a>)}</div>
  </section></main>;
}

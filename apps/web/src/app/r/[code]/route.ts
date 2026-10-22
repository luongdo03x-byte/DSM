import {NextResponse} from 'next/server';

const apiBase=process.env.API_INTERNAL_URL??process.env.NEXT_PUBLIC_API_BASE_URL??'http://127.0.0.1:4000';
export async function GET(request:Request,{params}:{params:Promise<{code:string}>}){
  const {code}=await params;
  const headers=new Headers();
  for(const name of ['referer','user-agent']){const value=request.headers.get(name);if(value)headers.set(name,value)}
  const response=await fetch(`${apiBase}/r/${encodeURIComponent(code)}`,{headers,redirect:'manual',cache:'no-store'});
  const location=response.headers.get('location');
  if(response.status!==302||!location)return new NextResponse('Link không tồn tại',{status:404});
  return NextResponse.redirect(location,302);
}

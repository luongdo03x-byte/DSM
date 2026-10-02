'use client';
import {ApiClient,createBrowserFetcher,readCookie} from './api-client.ts';
import {browserSession} from '../features/auth/session.ts';
const fetcher=createBrowserFetcher();
export const browserApi=new ApiClient({session:browserSession,fetcher,csrfTokenResolver:()=>readCookie('csrf_token')});
export async function browserLogin(email:string,password:string){const response=await fetcher('/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password}),credentials:'include'});if(response.status!==200)throw new Error('INVALID_CREDENTIALS');const body=await response.json();if(!body?.accessToken)throw new Error('INVALID_LOGIN_RESPONSE');browserSession.setAccessToken(body.accessToken);return browserApi.request<{brands:Array<{id:string;name:string;slug:string}>}>('/auth/context')}
export async function browserLogout(){const csrf=readCookie('csrf_token');await fetcher('/auth/logout',{method:'POST',headers:csrf?{'x-csrf-token':csrf}:{},credentials:'include'});browserSession.clear()}

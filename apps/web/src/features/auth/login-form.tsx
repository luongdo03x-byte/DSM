'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {browserLogin} from '../../lib/browser-runtime.ts';
import {loginErrorMessage,nextBrandRoute} from './login-flow.ts';

export function LoginForm(){
  const router=useRouter();
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [showPassword,setShowPassword]=useState(false);

  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    setBusy(true);
    setError('');
    try{
      const data=new FormData(event.currentTarget);
      const ctx=await browserLogin(String(data.get('email')??''),String(data.get('password')??''));
      router.replace(nextBrandRoute(ctx));
    }catch(error){
      setError(loginErrorMessage(error));
    }finally{
      setBusy(false);
    }
  }

  return <form className="login-form" onSubmit={submit}>
    <div className="login-field">
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" placeholder="ban@doanhnghiep.vn" required disabled={busy}/>
    </div>
    <div className="login-field">
      <div className="login-field__row"><label htmlFor="password">Mật khẩu</label>
        <button type="button" className="login-link-button" onClick={()=>setShowPassword(value=>!value)}>{showPassword?'Ẩn':'Hiện'}</button>
      </div>
      <input id="password" name="password" type={showPassword?'text':'password'} autoComplete="current-password" placeholder="Nhập mật khẩu" required disabled={busy}/>
    </div>
    {error?<div className="login-error" role="alert" aria-live="polite">{error}</div>:null}
    <button className="ui-button ui-button--primary login-submit" type="submit" disabled={busy}>{busy?'Đang đăng nhập...':'Đăng nhập'}</button>
  </form>;
}

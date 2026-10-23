import {expect,test} from '@playwright/test';
import {E2E_OWNER} from './e2e-owner.ts';

test('inbox reply dùng mẫu câu và hiện trạng thái đã trả lời',async({page})=>{
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_OWNER.email);
  await page.getByLabel('Mật khẩu').fill(E2E_OWNER.password);
  const loggedIn=page.waitForResponse(response=>new URL(response.url()).pathname==='/auth/login'&&response.status()===200);
  await page.getByRole('button',{name:'Đăng nhập'}).click();
  const token=(await (await loggedIn).json()).accessToken as string;
  const seeded=await page.evaluate(async accessToken=>{
    const headers={authorization:'Bearer '+accessToken,'content-type':'application/json'};
    const base='http://127.0.0.1:4000/brands/local-brand';
    const template=await fetch(base+'/reply-templates',{method:'POST',headers,body:JSON.stringify({name:'Chào khách',text:'Chào {ten}, cảm ơn bạn đã quan tâm.'})});
    const comment=await fetch('http://127.0.0.1:4000/__test/brands/local-brand/inbox-seed',{method:'POST',headers});
    return template.ok&&comment.ok;
  },token);
  expect(seeded).toBe(true);
  await page.getByRole('navigation').getByRole('link',{name:'Hộp thư'}).click();
  await expect(page.getByRole('heading',{name:'Hộp thư'})).toBeVisible();
  await page.getByRole('button',{name:/Cho mình xin giá sản phẩm/}).click();
  await page.getByLabel('Mẫu câu').selectOption({label:'Chào khách'});
  await expect(page.getByLabel('Nội dung trả lời')).toHaveValue('Chào An, cảm ơn bạn đã quan tâm.');
  await page.getByRole('button',{name:'Gửi trả lời'}).click();
  await expect(page.getByText('Đã trả lời',{exact:true}).last()).toBeVisible();
});

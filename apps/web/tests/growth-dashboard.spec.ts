import {expect,test} from '@playwright/test';
import {E2E_OWNER} from './e2e-owner.ts';

test('growth dashboard shows channel health and posting heatmap',async({page})=>{
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_OWNER.email);
  await page.getByLabel('Mật khẩu').fill(E2E_OWNER.password);
  const loggedIn=page.waitForResponse(response=>new URL(response.url()).pathname==='/auth/login'&&response.status()===200);
  await page.getByRole('button',{name:'Đăng nhập'}).click();
  const login=await loggedIn,token=(await login.json()).accessToken as string;
  const seeded=await page.evaluate(async(accessToken)=>{
    const response=await fetch('http://127.0.0.1:4000/__test/brands/local-brand/growth-seed',{method:'POST',headers:{authorization:'Bearer '+accessToken}});
    return response.ok;
  },token);
  expect(seeded).toBe(true);
  await page.getByRole('navigation').getByRole('link',{name:'Xây kênh'}).click();
  await expect(page.getByRole('heading',{name:'Xây kênh',exact:true})).toBeVisible();
  await expect(page.getByLabel('Điểm sức khỏe').first()).toHaveText(/\d+\/100/);
  await expect(page.getByLabel('Heatmap giờ vàng').first()).toContainText('Cần thêm 20 bài');
});

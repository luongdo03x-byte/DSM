import {test,expect} from '@playwright/test';

test('v1 critical UI journey',async({page})=>{
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.E2E_EMAIL??'owner@test.local');
  await page.getByLabel('Mật khẩu').fill(process.env.E2E_PASSWORD??'test-password');
  await page.getByRole('button',{name:'Đăng nhập'}).click();
  await expect(page).toHaveURL(/\/app\/brands\/[^/]+\/overview/);
  await expect(page.getByRole('heading',{name:'Tổng quan'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Tổng quan'})).toBeVisible();
  await page.getByRole('link',{name:'Sản phẩm'}).click();
  await expect(page.getByRole('heading',{name:'Sản phẩm'})).toBeVisible();
  await page.getByRole('link',{name:'Nội dung'}).click();
  await expect(page.getByRole('heading',{name:'Nội dung'})).toBeVisible();
  await page.getByRole('link',{name:'Lịch đăng'}).click();
  await expect(page.getByRole('heading',{name:'Lịch đăng'})).toBeVisible();
  await page.getByRole('link',{name:'Phân tích'}).click();
  await expect(page.getByRole('heading',{name:'Phân tích'})).toBeVisible();
  await page.getByRole('button',{name:'Đăng xuất khỏi DSM'}).click();
  await expect(page).toHaveURL(/\/login$/);
});

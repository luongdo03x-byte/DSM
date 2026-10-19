import {expect,test} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {E2E_OWNER} from './e2e-owner.ts';

const sample=fileURLToPath(new URL('../../../tests/fixtures/media/sample.png',import.meta.url));

test('compose journey publishes an ordered album to two accounts',async({page})=>{
  await page.route('https://storage.local/put/**',route=>route.fulfill({status:200,body:''}));
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_OWNER.email);
  await page.getByLabel('Mật khẩu').fill(E2E_OWNER.password);
  await page.getByRole('button',{name:'Đăng nhập'}).click();
  await expect(page).toHaveURL(/\/overview$/);
  await page.getByRole('navigation').getByRole('link',{name:'Tạo bài'}).click();
  await expect(page.getByRole('heading',{name:'Tạo bài',exact:true})).toBeVisible();
  await page.getByLabel('Loại nội dung').selectOption('ALBUM');
  await page.getByLabel('Tiêu đề').fill('Album thử nghiệm');
  await page.getByLabel('Nội dung gốc').fill('Ba ảnh cho Facebook và Instagram');
  await page.getByLabel('Tệp ảnh hoặc video').setInputFiles([sample,sample,sample]);
  const images=page.locator('[data-testid="compose-media-item"]');
  await expect(images).toHaveCount(3);
  await images.nth(2).dragTo(images.nth(0));
  await expect(images.first()).toHaveAttribute('data-order','3');
  await page.getByRole('checkbox',{name:/Facebook/}).check();
  await page.getByRole('checkbox',{name:/Instagram/}).check();
  await expect(page.getByRole('tab',{name:'Facebook'})).toBeVisible();
  await expect(page.getByRole('tab',{name:'Instagram'})).toBeVisible();
  await page.getByRole('button',{name:'Đăng ngay'}).click();
  await expect(page.getByRole('status')).toContainText('Đã đưa 2 bài vào hàng đợi');
  await page.getByRole('navigation').getByRole('link',{name:'Lịch đăng'}).click();
  await expect(page.locator('.job-card')).toHaveCount(2);
});

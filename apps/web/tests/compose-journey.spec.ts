import {expect,test} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {E2E_OWNER} from './e2e-owner.ts';

const sample=fileURLToPath(new URL('../../../tests/fixtures/media/sample.png',import.meta.url));
const video=fileURLToPath(new URL('../../../tests/fixtures/media/vertical-3s.mp4',import.meta.url));

test('AI suggestion edits a draft only after selection and never publishes it',async({page})=>{
  let aiCalls=0,publishCalls=0;
  await page.route('**/brands/local-brand/ai/captions',async route=>{
    aiCalls++;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({suggestions:[1,2,3].map(index=>({platform:'FACEBOOK',hook:`Mở đầu ${index}`,caption:`Gợi ý Facebook ${index}`,hashtags:[],rationale:'Bản thử',issues:[]}))})});
  });
  await page.route('**/brands/local-brand/publish',async route=>{publishCalls++;await route.continue()});
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_OWNER.email);
  await page.getByLabel('Mật khẩu').fill(E2E_OWNER.password);
  await page.getByRole('button',{name:'Đăng nhập'}).click();
  await page.getByRole('navigation').getByRole('link',{name:'Tạo bài'}).click();
  await page.getByLabel('Tiêu đề').fill('Bài AI thử nghiệm');
  await page.getByLabel('Nội dung gốc').fill('Nội dung gốc');
  await page.getByRole('checkbox',{name:/Facebook/}).check();
  await page.getByRole('button',{name:'Gợi ý bằng AI'}).click();
  await expect(page.getByRole('button',{name:'Dùng gợi ý 2'})).toBeVisible();
  await page.getByRole('button',{name:'Dùng gợi ý 2'}).click();
  await expect(page.getByLabel('Chú thích Facebook')).toHaveValue('Gợi ý Facebook 2');
  expect(aiCalls).toBe(1);
  expect(publishCalls).toBe(0);
  await expect(page.getByRole('button',{name:'Đăng ngay'})).toBeVisible();
});

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

  await page.getByRole('navigation').getByRole('link',{name:'Tạo bài'}).click();
  await page.getByLabel('Tiêu đề').fill('Bài lên lịch thử nghiệm');
  await page.getByLabel('Nội dung gốc').fill('Nội dung thử kéo lịch');
  await page.getByRole('checkbox',{name:/Facebook/}).check();
  await page.getByLabel('Thời điểm đăng').selectOption('at');
  const future=new Date(Date.now()+2*60*60_000);
  const target=new Date(Date.UTC(future.getUTCFullYear(),future.getUTCMonth(),future.getUTCDate()+1)).toISOString().slice(0,10);
  await page.getByLabel('Ngày').fill(future.toISOString().slice(0,10));
  await page.getByLabel('Giờ').fill(future.toISOString().slice(11,16));
  await page.getByRole('button',{name:'Lên lịch'}).click();
  await expect(page.getByRole('status')).toContainText('Đã đưa 1 bài vào hàng đợi');
  await page.getByRole('navigation').getByRole('link',{name:'Lịch đăng'}).click();
  const scheduled=page.locator('[draggable="true"]').filter({hasText:'Bài lên lịch thử nghiệm'});
  await expect(scheduled).toHaveCount(1);
  await scheduled.scrollIntoViewIfNeeded();
  const sourceBox=await scheduled.boundingBox(),targetBox=await page.locator(`[data-calendar-date="${target}"]`).boundingBox();
  if(!sourceBox||!targetBox)throw new Error('calendar drag coordinates unavailable');
  await page.mouse.move(sourceBox.x+15,sourceBox.y+15);
  await page.mouse.down();
  await page.mouse.move(targetBox.x+40,sourceBox.y+15,{steps:15});
  await page.mouse.up();
  await expect(page.locator(`[data-calendar-date="${target}"]`)).toContainText('Bài lên lịch thử nghiệm');
});

test('compose journey queues one video for four platforms and one album for three',async({page})=>{
  await page.route('https://storage.local/put/**',route=>route.fulfill({status:200,body:''}));
  await page.goto('/login');await page.getByLabel('Email').fill(E2E_OWNER.email);await page.getByLabel('Mật khẩu').fill(E2E_OWNER.password);await page.getByRole('button',{name:'Đăng nhập'}).click();await expect(page).toHaveURL(/\/overview$/);
  await page.getByRole('navigation').getByRole('link',{name:'Tạo bài'}).click();await page.getByLabel('Loại nội dung').selectOption('VIDEO');await page.getByLabel('Tiêu đề').fill('Video bốn nền tảng');await page.getByLabel('Nội dung gốc').fill('Video gốc');await page.getByLabel('Tệp ảnh hoặc video').setInputFiles(video);
  for(const name of ['Facebook','Instagram','TikTok','YouTube'])await page.getByRole('checkbox',{name:new RegExp(name)}).check();
  await page.getByRole('tab',{name:'TikTok'}).click();await page.getByLabel('Quyền riêng tư *').selectOption('PUBLIC_TO_EVERYONE');
  await page.getByRole('tab',{name:'YouTube'}).click();await page.getByLabel('Quyền riêng tư *').selectOption('public');await page.getByLabel('Dành cho trẻ em? *').selectOption('false');
  await page.getByRole('button',{name:'Đăng ngay'}).click();await expect(page.getByRole('status')).toContainText('Đã đưa 4 bài vào hàng đợi');
  await page.getByRole('navigation').getByRole('link',{name:'Tạo bài'}).click();await page.getByLabel('Loại nội dung').selectOption('ALBUM');await page.getByLabel('Tiêu đề').fill('Album ba nền tảng');await page.getByLabel('Nội dung gốc').fill('Album gốc');await page.getByLabel('Tệp ảnh hoặc video').setInputFiles([sample,sample,sample]);
  for(const name of ['Facebook','Instagram','TikTok'])await page.getByRole('checkbox',{name:new RegExp(name)}).check();
  await page.getByRole('tab',{name:'TikTok'}).click();await page.getByLabel('Quyền riêng tư *').selectOption('PUBLIC_TO_EVERYONE');
  await page.getByRole('button',{name:'Đăng ngay'}).click();await expect(page.getByRole('status')).toContainText('Đã đưa 3 bài vào hàng đợi');
});

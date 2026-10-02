import {test,expect} from '@playwright/test';

test('v1 critical UI journey',async({page})=>{
  test.skip(!process.env.E2E_SEEDED,'Requires seeded web/API test environment');
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.E2E_EMAIL??'owner@test.local');
  await page.getByLabel('Password').fill(process.env.E2E_PASSWORD??'test-password');
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page).toHaveURL(/\/app\/brands\/[^/]+\/overview/);
  await page.getByRole('link',{name:'Products'}).click();
  await expect(page.getByRole('heading',{name:'Products'})).toBeVisible();
  await page.getByRole('link',{name:'Content'}).click();
  await expect(page.getByRole('heading',{name:'Content'})).toBeVisible();
  await page.getByRole('link',{name:'Calendar'}).click();
  await expect(page.getByRole('heading',{name:'Calendar'})).toBeVisible();
  await page.getByRole('link',{name:'Analytics'}).click();
  await expect(page.getByRole('heading',{name:'Analytics'})).toBeVisible();
});

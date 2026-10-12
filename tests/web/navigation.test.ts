import test from 'node:test';
import assert from 'node:assert/strict';
import {NAV_ITEMS,buildBrandHref} from '../../apps/web/src/lib/ui/navigation.ts';

test('DSM navigation uses the approved Vietnamese labels',()=>{
  assert.deepEqual(NAV_ITEMS.map(item=>item.label),[
    'Tổng quan','Sản phẩm','Nội dung','Lịch đăng','Chiến dịch','Tài khoản','Phân tích','Cài đặt'
  ]);
});

test('buildBrandHref creates brand-scoped routes',()=>{
  assert.equal(buildBrandHref('local-brand','products'),'/app/brands/local-brand/products');
});

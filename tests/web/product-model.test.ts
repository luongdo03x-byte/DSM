import test from 'node:test';
import assert from 'node:assert/strict';
import {filterProducts,productMargin,productStats} from '../../apps/web/src/features/products/product-model.ts';

test('product margin uses selling price as the denominator',()=>{
  assert.equal(productMargin('60','100'),40);
  assert.equal(productMargin('120','100'),-20);
  assert.equal(productMargin(null,'100'),null);
  assert.equal(productMargin('10',null),null);
  assert.equal(productMargin('10','0'),null);
});
test('product search matches name, slug and description without case sensitivity',()=>{
  const products=[{id:'1',name:'Áo Linen',slug:'ao-linen',description:'Màu be',status:'ACTIVE'},{id:'2',name:'Túi da',slug:'tui-da',status:'ARCHIVED'}];
  assert.equal(filterProducts(products,'LINEN').length,1);
  assert.equal(filterProducts(products,'màu be')[0]?.id,'1');
  assert.equal(filterProducts(products,'').length,2);
});
test('product stats separate active, draft and archived records',()=>{
  assert.deepEqual(productStats([{id:'1',name:'A',status:'ACTIVE'},{id:'2',name:'B',status:'DRAFT'},{id:'3',name:'C',status:'ARCHIVED'}]),{total:3,active:1,draft:1,archived:1});
});

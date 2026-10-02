export interface ProductForm{ name:string; slug:string; currency:string; description?:string; supplierUrl?:string; landingUrl?:string; cost?:string; sellingPrice?:string }
function checkUrl(v?:string){if(v===undefined)return;try{new URL(v)}catch{throw new Error('INVALID_URL')}}
function checkMoney(v?:string){if(v!==undefined&&!/^\d+(\.\d{1,4})?$/.test(v))throw new Error('INVALID_MONEY')}
export function parseProductForm(input:ProductForm):ProductForm{if(!input.name.trim()||!input.slug.trim())throw new Error('REQUIRED');if(!/^[A-Z]{3}$/.test(input.currency))throw new Error('INVALID_CURRENCY');checkUrl(input.supplierUrl);checkUrl(input.landingUrl);checkMoney(input.cost);checkMoney(input.sellingPrice);return {...input}}

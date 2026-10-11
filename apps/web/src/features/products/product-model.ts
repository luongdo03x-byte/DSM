export type ProductSnapshot={id:string;name:string;slug?:string;description?:string;cost?:string|null;sellingPrice?:string|null;currency?:string;status?:string;createdAt?:number};

function money(value:string|number|null|undefined):number|null{
  if(value===null||value===undefined||value==='')return null;
  const parsed=typeof value==='number'?value:Number(value);
  return Number.isFinite(parsed)&&parsed>=0?parsed:null;
}

export function productMargin(cost:string|number|null|undefined,price:string|number|null|undefined):number|null{
  const c=money(cost),p=money(price);
  if(c===null||p===null||p<=0)return null;
  return ((p-c)/p)*100;
}

export function filterProducts<T extends ProductSnapshot>(products:T[],query:string):T[]{
  const normalized=query.trim().toLocaleLowerCase('vi-VN');
  if(!normalized)return [...products];
  return products.filter(product=>[product.name,product.slug??'',product.description??'',product.status??''].some(value=>value.toLocaleLowerCase('vi-VN').includes(normalized)));
}

export function productStats(products:ProductSnapshot[]){
  return {
    total:products.length,
    active:products.filter(product=>product.status==='ACTIVE').length,
    draft:products.filter(product=>product.status==='DRAFT').length,
    archived:products.filter(product=>product.status==='ARCHIVED').length
  };
}

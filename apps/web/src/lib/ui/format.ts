export function formatMetric(value:number|null|undefined){
  return value===null||value===undefined||Number.isNaN(value)?'—':new Intl.NumberFormat('vi-VN').format(value);
}

export function formatCurrency(value:number|null|undefined,currency='VND'){
  if(value===null||value===undefined||Number.isNaN(value))return '—';
  return new Intl.NumberFormat('vi-VN',{style:'currency',currency,maximumFractionDigits:currency==='VND'?0:2}).format(value);
}

export function formatPercent(value:number|null|undefined){
  if(value===null||value===undefined||Number.isNaN(value)||!Number.isFinite(value))return '—';
  return new Intl.NumberFormat('vi-VN',{style:'percent',maximumFractionDigits:1}).format(value);
}

export function safeRatio(numerator:number|null|undefined,denominator:number|null|undefined){
  if(numerator===null||numerator===undefined||denominator===null||denominator===undefined||denominator<=0)return null;
  const value=numerator/denominator;
  return Number.isFinite(value)?value:null;
}

export function formatDateTime(value:string|Date|null|undefined){
  if(!value)return '—';
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))return '—';
  return new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'short'}).format(date);
}

export type BrandSection='overview'|'products'|'content'|'calendar'|'campaigns'|'accounts'|'analytics'|'settings';

export const NAV_ITEMS:{section:BrandSection;label:string;icon:string}[]=[
  {section:'overview',label:'Tổng quan',icon:'home'},
  {section:'products',label:'Sản phẩm',icon:'box'},
  {section:'content',label:'Nội dung',icon:'edit'},
  {section:'calendar',label:'Lịch đăng',icon:'calendar'},
  {section:'campaigns',label:'Chiến dịch',icon:'target'},
  {section:'accounts',label:'Tài khoản',icon:'users'},
  {section:'analytics',label:'Phân tích',icon:'chart'},
  {section:'settings',label:'Cài đặt',icon:'settings'},
];

export function buildBrandHref(brandId:string,section:BrandSection){
  return `/app/brands/${brandId}/${section}`;
}

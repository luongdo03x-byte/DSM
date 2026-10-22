export type BrandSection='overview'|'products'|'content'|'compose'|'calendar'|'campaigns'|'accounts'|'analytics'|'growth'|'settings';

export const NAV_ITEMS:{section:BrandSection;label:string;icon:string}[]=[
  {section:'overview',label:'Tổng quan',icon:'home'},
  {section:'products',label:'Sản phẩm',icon:'box'},
  {section:'content',label:'Nội dung',icon:'edit'},
  {section:'compose',label:'Tạo bài',icon:'edit'},
  {section:'calendar',label:'Lịch đăng',icon:'calendar'},
  {section:'campaigns',label:'Chiến dịch',icon:'target'},
  {section:'accounts',label:'Tài khoản',icon:'users'},
  {section:'analytics',label:'Phân tích',icon:'chart'},
  {section:'growth',label:'Xây kênh',icon:'chart'},
  {section:'settings',label:'Cài đặt',icon:'settings'},
];

export function buildBrandHref(brandId:string,section:BrandSection){
  return `/app/brands/${brandId}/${section}`;
}

export interface BrandSummary{id:string;name:string}
export function resolveBrandContext(routeBrandId:string,brand:BrandSummary){if(routeBrandId!==brand.id)throw new Error('BRAND_NOT_FOUND');return{brandId:brand.id,brand}}
export function brandOverviewPath(brandId:string){return `/app/brands/${brandId}/overview`}

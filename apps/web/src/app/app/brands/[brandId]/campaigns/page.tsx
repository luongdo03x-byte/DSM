import {BrandSectionClient} from '../../../../../features/runtime/brand-section-client.tsx';
export default async function Page({params}:any){const {brandId}=await params;return <BrandSectionClient brandId={brandId} section="campaigns"/>}

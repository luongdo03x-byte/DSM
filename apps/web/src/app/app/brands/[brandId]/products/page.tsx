import {ProductsManager} from '../../../../../features/products/products-manager.tsx';
export default async function Page({params}:any){const {brandId}=await params;return <ProductsManager brandId={brandId}/>}

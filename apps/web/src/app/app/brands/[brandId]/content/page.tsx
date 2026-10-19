import {ContentManager} from '../../../../../features/content/content-manager.tsx';
export default async function Page({params}:any){const {brandId}=await params;return <ContentManager brandId={brandId}/>}

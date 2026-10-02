import {ContentManager} from '../../../../../features/content/content-manager.tsx';import {PublishManager} from '../../../../../features/publishing/publish-manager.tsx';
export default async function Page({params}:any){const {brandId}=await params;return <><ContentManager brandId={brandId}/><PublishManager brandId={brandId}/></>}

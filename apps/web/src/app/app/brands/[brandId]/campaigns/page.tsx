import {CampaignsManager} from '../../../../../features/campaigns/campaigns-manager.tsx';
export default async function Page({params}:{params:Promise<{brandId:string}>}){const {brandId}=await params;return <CampaignsManager brandId={brandId}/>;}

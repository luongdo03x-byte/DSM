import {SettingsDashboard} from '../../../../../features/settings/settings-dashboard.tsx';
export default async function Page({params}:{params:Promise<{brandId:string}>}){const {brandId}=await params;return <SettingsDashboard brandId={brandId}/>;}

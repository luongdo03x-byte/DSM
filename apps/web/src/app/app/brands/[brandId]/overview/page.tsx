import {OverviewDashboard} from '../../../../../features/overview/overview-dashboard.tsx';

export default async function Page({params}:{params:Promise<{brandId:string}>}){
  const {brandId}=await params;
  return <OverviewDashboard brandId={brandId}/>;
}

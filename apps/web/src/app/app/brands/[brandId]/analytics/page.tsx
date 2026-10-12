import {AnalyticsDashboard} from '../../../../../features/analytics/analytics-dashboard.tsx';
export default async function Page({params}:{params:Promise<{brandId:string}>}){const {brandId}=await params;return <AnalyticsDashboard brandId={brandId}/>;}

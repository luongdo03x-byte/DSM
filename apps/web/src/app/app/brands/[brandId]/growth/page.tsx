import {GrowthDashboard} from '../../../../../features/growth/growth-dashboard.tsx';
export default async function GrowthPage({params}:{params:Promise<{brandId:string}>}){const {brandId}=await params;return <GrowthDashboard brandId={brandId}/>}

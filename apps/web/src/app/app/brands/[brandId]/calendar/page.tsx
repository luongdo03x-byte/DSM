import {CalendarDashboard} from '../../../../../features/calendar/calendar-dashboard.tsx';
export default async function Page({params}:{params:Promise<{brandId:string}>}){const {brandId}=await params;return <CalendarDashboard brandId={brandId}/>;}

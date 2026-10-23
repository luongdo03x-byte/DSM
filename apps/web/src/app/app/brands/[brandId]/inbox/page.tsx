import {InboxDashboard} from '../../../../../features/inbox/inbox-dashboard.tsx';
export default async function InboxPage({params}:{params:Promise<{brandId:string}>}){const {brandId}=await params;return <InboxDashboard brandId={brandId}/>}

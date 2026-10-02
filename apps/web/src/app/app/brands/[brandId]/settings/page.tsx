import {NodeRegistrationManager} from '../../../../../features/browser-nodes/node-registration-manager.tsx';
export default async function Page({params}:any){const {brandId}=await params;return <NodeRegistrationManager brandId={brandId}/>}

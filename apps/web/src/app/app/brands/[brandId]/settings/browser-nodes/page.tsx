import {NodeRegistrationManager} from '../../../../../../features/browser-nodes/node-registration-manager.tsx';
export default async function BrowserNodesPage({params}:{params:Promise<{brandId:string}>}){const {brandId}=await params;return <NodeRegistrationManager brandId={brandId}/>;}

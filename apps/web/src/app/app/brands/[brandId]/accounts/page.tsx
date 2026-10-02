import {AccountsManager} from '../../../../../features/accounts/accounts-manager.tsx';
export default async function Page({params}:any){const {brandId}=await params;return <AccountsManager brandId={brandId}/>}

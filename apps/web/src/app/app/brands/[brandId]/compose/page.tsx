import {ComposePage} from '../../../../../features/compose/compose-page.tsx';
export default async function Page({params}:any){const {brandId}=await params;return <ComposePage brandId={brandId}/>}

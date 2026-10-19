import {ComposePage} from '../../../../../../features/compose/compose-page.tsx';
export default async function Page({params}:any){const {brandId,contentId}=await params;return <ComposePage brandId={brandId} contentId={contentId}/>}

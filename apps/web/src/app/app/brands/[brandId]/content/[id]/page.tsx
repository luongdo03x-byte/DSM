import {redirect} from 'next/navigation';
export default async function ContentDetailPage({params}:{params:Promise<{brandId:string;id:string}>}){const {brandId}=await params;redirect('/app/brands/'+brandId+'/content')}

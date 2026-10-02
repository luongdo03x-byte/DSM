import {AppShell} from '../../../../components/app-shell.tsx';
export default async function BrandLayout({children,params}:any){const {brandId}=await params;return <AppShell brandId={brandId}>{children}</AppShell>}

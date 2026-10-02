declare namespace JSX { interface IntrinsicElements { [elemName:string]: any } interface Element {} }
declare module 'react' { export type ReactNode=any; export function useState<T>(v:T):[T,(v:T)=>void]; export function useEffect(fn:()=>void|(()=>void),deps?:unknown[]):void; }
declare module 'next/navigation' { export function useRouter():{push(path:string):void;replace(path:string):void;refresh():void}; export function redirect(path:string):never; }
declare module 'next/link' { const Link:any; export default Link; }
declare module 'next' { export type Metadata=Record<string,unknown>; }
declare module 'playwright' { export const chromium:any; }
declare module 'prisma/config' { export function defineConfig(input:any):any; export function env(name:string):string; }

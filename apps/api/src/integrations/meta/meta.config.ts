export interface MetaConfig{graphBaseUrl:string;graphVersion:string;threadsBaseUrl:string}
export function metaConfig(env:Record<string,string|undefined>=process.env){return{graphBaseUrl:env.META_GRAPH_BASE_URL??'https://graph.facebook.com',graphVersion:env.META_GRAPH_VERSION??'v24.0',threadsBaseUrl:env.THREADS_API_BASE_URL??'https://graph.threads.net/v1.0'}}

export function browserNodeViewModel(input:{status:'ONLINE'|'OFFLINE'|'DEGRADED';activeTasks:number;maxConcurrency:number;lastSeenAt:number;gpmHealthy:boolean}){
  const canDispatch=input.status==='ONLINE'&&input.gpmHealthy&&input.activeTasks<input.maxConcurrency;
  const actionMessage=canDispatch?'Ready':input.status==='OFFLINE'?'Browser node offline':input.status==='DEGRADED'?'Browser node degraded':!input.gpmHealthy?'GPMLogin unhealthy':'At capacity';
  return{...input,canDispatch,actionMessage};
}

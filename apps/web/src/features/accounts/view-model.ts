export function accountViewModel(input:{status:'CONNECTED'|'EXPIRED'|'DISCONNECTED'|'ERROR';publishMode:'API'|'BROWSER'|'HYBRID';hasBrowserProfile:boolean;nodeStatus?:'ONLINE'|'OFFLINE'|'DEGRADED'}){
  const apiReady=input.status==='CONNECTED'&&input.publishMode!=='BROWSER';
  const browserReady=input.hasBrowserProfile&&input.publishMode!=='API'&&input.nodeStatus==='ONLINE';
  return{apiReady,browserReady,canOpenBrowser:browserReady,primaryAction:input.status==='EXPIRED'?'Reconnect':input.status==='CONNECTED'?'Settings':'Connect'};
}
export function disconnectPlan(input:{hasBrowserProfile:boolean}){return{revokeCredential:true,detachProfile:false,deleteExternalProfile:false,requiresExplicitProfileDelete:input.hasBrowserProfile}}

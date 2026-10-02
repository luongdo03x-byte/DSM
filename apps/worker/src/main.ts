export function startWorker(){const state={service:'worker',status:'READY',startedAt:Date.now()};return state}
if(process.argv[1]?.endsWith('/main.ts'))console.log(JSON.stringify(startWorker()));

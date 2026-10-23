import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {AiService,createAiClient} from '../../apps/api/src/modules/ai/ai.service.ts';

const PLATFORMS=['FACEBOOK','INSTAGRAM','THREADS','TIKTOK'];
const COST_PER_MILLION={input:4,output:20,cacheRead:0.20};

export function validateEvalSet(data){
  if(!data||typeof data!=='object'||!data.brandVoice||typeof data.brandVoice.tone!=='string'||!data.brandVoice.tone.trim())throw new Error('eval-set cần brandVoice.tone thật của kênh.');
  if(!Array.isArray(data.samples)||data.samples.length!==20)throw new Error('eval-set cần đúng 20 nội dung gốc thật đã bỏ dữ liệu cá nhân.');
  const ids=new Set();
  for(const sample of data.samples){
    if(!sample||typeof sample.id!=='string'||!sample.id.trim()||typeof sample.title!=='string'||!sample.title.trim()||typeof sample.body!=='string'||!sample.body.trim()||ids.has(sample.id))throw new Error('Mỗi mẫu cần id duy nhất, title và body không rỗng.');
    ids.add(sample.id);
  }
  return data;
}
export function estimatedUsd(rows,prices=COST_PER_MILLION){
  const usage=rows.reduce((sum,row)=>({input:sum.input+(row.usage?.inputTokens??0),output:sum.output+(row.usage?.outputTokens??0),cacheRead:sum.cacheRead+(row.usage?.cacheReadTokens??0)}),{input:0,output:0,cacheRead:0});
  return Math.round((usage.input*prices.input+usage.output*prices.output+usage.cacheRead*prices.cacheRead)/1_000_000*10000)/10000;
}

async function main(){
  const args=process.argv.slice(2);
  const file=resolve(args.find(arg=>arg.endsWith('.json'))??'scripts/ai/eval-set.json');
  const data=validateEvalSet(JSON.parse(await readFile(file,'utf8')));
  if(args.includes('--validate')){console.log('eval-set hợp lệ: 20 nội dung, 80 lời gọi dự kiến.');return}
  if(!args.includes('--approve-paid-run'))throw new Error('Chạy Claude thật tốn phí. Chỉ chạy sau khi chủ repo đồng ý và truyền --approve-paid-run.');
  if(!process.env.ANTHROPIC_API_KEY)throw new Error('ANTHROPIC_API_KEY_REQUIRED');
  const repos=new MemoryRepositories(new MemoryStore());
  await repos.brands.insert({id:'eval-brand',workspaceId:'eval-workspace',name:'Đánh giá AI',slug:'eval-brand',language:'vi',timezone:'Asia/Ho_Chi_Minh',currency:'VND',status:'ACTIVE'});
  await repos.brandVoices.insert({id:'eval-voice',brandId:'eval-brand',version:1,tone:data.brandVoice.tone,doList:data.brandVoice.doList??[],dontList:data.brandVoice.dontList??[],samplePosts:data.brandVoice.samplePosts??[]});
  const ai=new AiService({client:createAiClient(process.env.ANTHROPIC_API_KEY),repos,quota:async()=>true,model:process.env.AI_MODEL??'claude-opus-5-5'});
  const outputDir=resolve(process.env.AI_EVAL_OUTPUT_DIR??'.superpowers/sdd/2026-10-16-dsm-sp10-ai-assistant');
  await mkdir(outputDir,{recursive:true});
  const output=join(outputDir,`ai-eval-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  const rows=[];
  for(const sample of data.samples){
    const contentId=`eval-content-${sample.id}`;
    await repos.contents.insert({id:contentId,brandId:'eval-brand',type:sample.type??'TEXT',title:sample.title,body:sample.body,...(sample.hook?{hook:sample.hook}:{}),...(sample.cta?{cta:sample.cta}:{}),status:'DRAFT'});
    for(const platform of PLATFORMS){
      const result=await ai.captions('eval-brand',contentId,[platform],1);
      const suggestion=result.suggestions[0];
      const usage=(await repos.aiUsage.findBy({workspaceId:'eval-workspace'})).at(-1);
      const issues=suggestion?.issues??[];
      rows.push({sampleId:sample.id,platform,suggestion,usage,preflightWithoutCut:!issues.some(issue=>issue.severity==='error'||issue.code.endsWith('_MAX'))});
      await writeFile(output,JSON.stringify({model:process.env.AI_MODEL??'claude-opus-5-5',createdAt:new Date().toISOString(),completed:rows.length,expected:80,estimatedUsd:estimatedUsd(rows),preflightWithoutCutRate:rows.filter(row=>row.preflightWithoutCut).length/rows.length,rows},null,2));
      console.log(`${rows.length}/80 ${sample.id} ${platform} · ước tính $${estimatedUsd(rows).toFixed(4)}`);
    }
  }
  console.log(`Kết quả riêng tư: ${output}`);
  console.log(`Không cần cắt và qua preflight: ${rows.filter(row=>row.preflightWithoutCut).length}/80; chi phí ước tính $${estimatedUsd(rows).toFixed(4)} (chưa gồm cache writes hoặc phụ phí).`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1});

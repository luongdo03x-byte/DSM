import type {AutomationRule,CommentAction,SocialComment} from '../domain.ts';

export function normalizeVi(value:string):string{
  return value.toLowerCase().replace(/đ/g,'d').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}

export function renderTemplate(text:string,vars:{authorName:string;productName?:string;link?:string}):string{
  const replacements:Record<string,string>={ten:vars.authorName,sanpham:vars.productName??'',link:vars.link??''};
  return text.replace(/\{(ten|sanpham|link)\}/g,(_,key:string)=>replacements[key]??'');
}

export function matchRules(comment:SocialComment,rules:AutomationRule[],recentCounts:Record<string,number>):{ruleId:string;actions:CommentAction['kind'][];texts:{reply?:string;privateReply?:string}}[]{
  if(comment.isFromPage||comment.status!=='NEW')return[];
  const content=normalizeVi(comment.text);
  return rules.flatMap(rule=>{
    if(!rule.enabled||rule.brandId!==comment.brandId||!rule.platforms.includes(comment.platform)||
       (recentCounts[rule.id]??0)>=rule.maxPerHour||rule.maxPerHour<1)return[];
    const keywords=rule.match.keywords.map(normalizeVi).filter(Boolean);
    if(!keywords.length||(rule.match.mode==='ALL'?!keywords.every(word=>content.includes(word)):!keywords.some(word=>content.includes(word))))return[];
    const actions:CommentAction['kind'][]=[];
    if(rule.actions.reply?.trim())actions.push('REPLY');
    if(rule.actions.privateReply?.trim())actions.push('PRIVATE_REPLY');
    if(rule.actions.hide)actions.push('HIDE');
    return actions.length?[{ruleId:rule.id,actions,texts:{...(rule.actions.reply?{reply:rule.actions.reply}:{}),...(rule.actions.privateReply?{privateReply:rule.actions.privateReply}:{})}}]:[];
  });
}

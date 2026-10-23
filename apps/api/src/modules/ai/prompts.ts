import type {BrandVoice} from '../../../../../packages/shared/src/domain.ts';
import {MEDIA_RULES} from '../../../../../packages/shared/src/media-rules.ts';

const fixedRules=`Bạn là trợ lý biên tập tiếng Việt cho DSM. Chỉ tạo gợi ý nháp; không tự đăng, không suy diễn thông tin sản phẩm. Tôn trọng giới hạn và định dạng của từng nền tảng: ${JSON.stringify(MEDIA_RULES)}`;

export function buildSystem(voice:BrandVoice|undefined):Array<{type:'text';text:string;cache_control:{type:'ephemeral'}}>{
  return [
    {type:'text',text:fixedRules,cache_control:{type:'ephemeral'}},
    {type:'text',text:voice?`Giọng thương hiệu phiên bản ${voice.version}: ${JSON.stringify({tone:voice.tone,doList:voice.doList,dontList:voice.dontList,samplePosts:voice.samplePosts})}`:'Giọng thương hiệu: tiếng Việt tự nhiên, rõ ràng; chưa có cấu hình riêng.',cache_control:{type:'ephemeral'}},
  ];
}

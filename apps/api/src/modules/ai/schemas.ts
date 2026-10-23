import {z} from 'zod';

export const AiTextSchema=z.object({answer:z.string()});
export const CaptionSuggestionSchema=z.object({platform:z.enum(['FACEBOOK','INSTAGRAM','THREADS','TIKTOK','YOUTUBE']),hook:z.string(),caption:z.string(),hashtags:z.array(z.string()),cta:z.string().optional(),rationale:z.string()});
export const CaptionSuggestionsSchema=z.object({suggestions:z.array(CaptionSuggestionSchema)});
export type CaptionSuggestion=z.infer<typeof CaptionSuggestionSchema>;
export const YoutubeMetaSchema=z.object({titles:z.array(z.string()).min(3).max(5),description:z.string(),tags:z.array(z.string()),chapters:z.array(z.object({start:z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/),title:z.string()}))});
export const PlanSchema=z.object({items:z.array(z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),socialAccountId:z.string(),pillarId:z.string(),format:z.enum(['TEXT','LINK','IMAGE','ALBUM','VIDEO','REEL','STORY','SHORT']),idea:z.string(),hook:z.string(),eventName:z.string().optional()}))});

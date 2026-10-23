import {z} from 'zod';

export const AiTextSchema=z.object({answer:z.string()});
export const CaptionSuggestionSchema=z.object({platform:z.enum(['FACEBOOK','INSTAGRAM','THREADS','TIKTOK','YOUTUBE']),hook:z.string(),caption:z.string(),hashtags:z.array(z.string()),cta:z.string().optional(),rationale:z.string()});
export const CaptionSuggestionsSchema=z.object({suggestions:z.array(CaptionSuggestionSchema)});
export type CaptionSuggestion=z.infer<typeof CaptionSuggestionSchema>;

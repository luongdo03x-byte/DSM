import type {Platform} from '../../../../../packages/shared/src/domain.ts';
import type {CaptionSuggestion} from '../../../../api/src/modules/ai/schemas.ts';
import {composeReducer,type ComposeState} from './compose-model.ts';

export function applySuggestion(state:ComposeState,platform:Platform,suggestion:CaptionSuggestion):ComposeState{
  if(suggestion.platform!==platform)throw new Error('AI_PLATFORM_MISMATCH');
  return composeReducer(state,{type:'applyAiSuggestion',platform,suggestion});
}

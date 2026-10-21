import test from 'node:test';
import assert from 'node:assert/strict';
import {youtubeTitleDefault,youtubeSettingsState,canSubmitYouTube} from '../../apps/web/src/features/compose/youtube-settings-model.ts';

test('YouTube default title is cut at 100 characters with a warning',()=>{const result=youtubeTitleDefault('A'.repeat(105));assert.equal(result.title.length,100);assert.match(result.warning??'',/100/)});
test('unaudited YouTube app shows private notice and only private privacy',()=>{const state=youtubeSettingsState(false);assert.deepEqual(state.privacyOptions.map(x=>x.value),['private']);assert.match(state.notice??'',/riêng tư/)});
test('made for kids choice is required before submitting YouTube',()=>{const state=youtubeSettingsState(true);assert.equal(canSubmitYouTube({privacyStatus:'public'},state),false);assert.equal(canSubmitYouTube({privacyStatus:'public',madeForKids:false},state),true)});

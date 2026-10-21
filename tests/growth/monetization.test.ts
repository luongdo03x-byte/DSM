import test from 'node:test';
import assert from 'node:assert/strict';
import {MONETIZATION_PROGRAMS,monetizationProgress} from '../../packages/shared/src/growth/monetization.ts';

test('YouTube ads program chooses requirements by validFrom',()=>{
  const base=MONETIZATION_PROGRAMS.find(program=>program.id==='youtube-ads')!;
  const changed={...base,validFrom:'2027-02-01',requirements:[[{metric:'subscribers' as const,min:1000},{metric:'publicWatchHours12m' as const,min:8000}],[{metric:'subscribers' as const,min:1000},{metric:'shortsViews90d' as const,min:10_000_000}]]};
  const programs=[...MONETIZATION_PROGRAMS,changed],facts={subscribers:1200,publicWatchHours12m:3000,shortsViews90d:null};
  assert.equal(monetizationProgress('youtube-ads',facts,'2026-12-01',programs).groups[0]?.items[1]?.min,4000);
  assert.equal(monetizationProgress('youtube-ads',facts,'2027-03-01',programs).groups[0]?.items[1]?.min,8000);
});

test('YouTube 1200 subscribers and 3000 watch hours is 75% of the watch threshold',()=>{
  const result=monetizationProgress('youtube-ads',{subscribers:1200,publicWatchHours12m:3000,shortsViews90d:null},'2026-12-01');
  assert.equal(result.groups[0]?.met,false);assert.equal(result.groups[0]?.items[1]?.pct,0.75);
  assert.equal(result.groups[1]?.items[1]?.pct,null);
});

test('YouTube early program includes public uploads and qualified watch or Shorts views',()=>{
  const program=MONETIZATION_PROGRAMS.find(row=>row.id==='youtube-early')!;
  assert.ok(program.requirements.every(group=>group.some(item=>item.metric==='publicUploads90d'&&item.min===3)));
  assert.ok(program.requirements.some(group=>group.some(item=>item.metric==='publicWatchHours12m'&&item.min===3000)));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {groupJobsByDay,jobActionsForStatus} from '../../apps/web/src/features/calendar/calendar-actions.ts';
test('published, cancelled and processing jobs cannot be retried',()=>{for(const status of ['PUBLISHED','CANCELLED','PROCESSING'])assert.equal(jobActionsForStatus(status).canRetry,false)});
test('failed and retrying jobs can retry; queued jobs can be rescheduled or cancelled',()=>{assert.equal(jobActionsForStatus('FAILED').canRetry,true);assert.equal(jobActionsForStatus('RETRYING').canRetry,true);assert.deepEqual(jobActionsForStatus('QUEUED'),{canRetry:false,canReschedule:true,canCancel:true})});
test('empty calendar and day grouping are safe',()=>{assert.deepEqual(groupJobsByDay([]),[]);const grouped=groupJobsByDay([{id:'late',status:'QUEUED',scheduledAt:Date.parse('2026-10-12T10:00:00')},{id:'early',status:'QUEUED',scheduledAt:Date.parse('2026-10-11T10:00:00')}]);assert.equal(grouped.length,2);assert.equal(grouped[0]?.jobs[0]?.id,'early')});

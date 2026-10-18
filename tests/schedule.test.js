import test from 'node:test';
import assert from 'node:assert/strict';

import {contrastAdjustmentFromIntensity, parseTime, resolveScheduledState, scheduleAt} from '../schedule.js';

test('accepts only valid 24-hour HH:MM values', () => {
    assert.equal(parseTime('20:00'), 1200);
    assert.equal(parseTime('00:05'), 5);
    assert.equal(parseTime('24:00'), null);
    assert.equal(parseTime('8:00'), null);
});

test('handles an ordinary daytime schedule and its next boundary', () => {
    const result = scheduleAt(new Date(2026, 0, 1, 21, 15), '20:00', '07:00');
    assert.equal(result.active, true);
    assert.equal(new Date(result.nextBoundary * 1000).getHours(), 7);
    assert.equal(new Date(result.nextBoundary * 1000).getDate(), 2);
});

test('handles intervals that pass midnight', () => {
    assert.equal(scheduleAt(new Date(2026, 0, 1, 23, 30), '20:00', '07:00').active, true);
    assert.equal(scheduleAt(new Date(2026, 0, 1, 6, 59), '20:00', '07:00').active, true);
    assert.equal(scheduleAt(new Date(2026, 0, 1, 12, 0), '20:00', '07:00').active, false);
});

test('rejects equal and malformed schedule times', () => {
    assert.equal(scheduleAt(new Date(), '20:00', '20:00').valid, false);
    assert.equal(scheduleAt(new Date(), '25:00', '07:00').valid, false);
});

test('manual schedule choices override the current interval only until its next boundary', () => {
    const schedule = scheduleAt(new Date(2026, 0, 1, 22, 0), '20:00', '07:00');
    assert.equal(resolveScheduledState(schedule, true, false, schedule.nextBoundary, schedule.nextBoundary - 10), false);
    assert.equal(resolveScheduledState(schedule, true, false, schedule.nextBoundary, schedule.nextBoundary), schedule.active);
});

test('maps contrast reduction intensity to Clutter contrast adjustment range', () => {
    assert.equal(contrastAdjustmentFromIntensity(0), 0);
    assert.equal(contrastAdjustmentFromIntensity(40), -.4);
    assert.equal(contrastAdjustmentFromIntensity(100), -1);
});

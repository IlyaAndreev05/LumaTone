import test from 'node:test';
import assert from 'node:assert/strict';
import {ColorEffects} from '../color-effects.js';

function makeAdapter({failOn = null} = {}) {
    const events = [];
    const adapter = {
        createEffect: kind => ({kind}),
        addEffect(kind, effect) {
            events.push(['add', kind, effect]);
            if (kind === failOn)
                throw new Error(`attach ${kind}`);
        },
        configureEffect: (kind, effect, values) => events.push(['configure', kind, effect, values]),
        removeEffect: (kind, effect) => events.push(['remove', kind, effect]),
        disableUnredirect: () => events.push(['disable-unredirect']),
        enableUnredirect: () => events.push(['enable-unredirect']),
        onError: error => events.push(['error', error.message]),
        onCleanupError: error => events.push(['cleanup-error', error.message]),
    };
    return {adapter, events};
}

test('reuses a single warm effect as temperature and strength change', () => {
    const {adapter, events} = makeAdapter();
    const effects = new ColorEffects(adapter);

    effects.apply('warm', 40, 4980);
    effects.apply('warm', 55, 4200);

    assert.equal(events.filter(([event, kind]) => event === 'add' && kind === 'warm').length, 1);
    assert.deepEqual(events.at(-1).slice(0, 2), ['configure', 'warm']);
    assert.equal(events.filter(([event]) => event === 'disable-unredirect').length, 1);
});

test('removes the previous mode when switching and keeps contrast independent', () => {
    const {adapter, events} = makeAdapter();
    const effects = new ColorEffects(adapter);

    effects.apply('warm', 40, 4200, 25);
    effects.apply('monochrome', 100, 4200, 25);

    assert.ok(events.some(([event, kind]) => event === 'remove' && kind === 'warm'));
    assert.equal(events.filter(([event, kind]) => event === 'add' && kind === 'contrast').length, 1);
    assert.equal(events.filter(([event, kind]) => event === 'add' && kind === 'monochrome').length, 1);
});

test('clears all effects and restores composition when both effects reach zero', () => {
    const {adapter, events} = makeAdapter();
    const effects = new ColorEffects(adapter);

    effects.apply('monochrome', 100);
    effects.apply('monochrome', 0, 6500, 0);
    effects.clear();

    assert.ok(events.some(([event, kind]) => event === 'remove' && kind === 'monochrome'));
    assert.equal(events.filter(([event]) => event === 'enable-unredirect').length, 1);
});

test('cleans up a partially attached effect after an installation failure', () => {
    const {adapter, events} = makeAdapter({failOn: 'warm'});
    const effects = new ColorEffects(adapter);

    assert.equal(effects.apply('warm', 40, 4200), false);
    assert.ok(events.some(([event, kind]) => event === 'remove' && kind === 'warm'));
    assert.ok(events.some(([event]) => event === 'enable-unredirect'));
    assert.ok(events.some(([event, message]) => event === 'error' && message === 'attach warm'));
});

test('clear is safe to call repeatedly', () => {
    const {adapter, events} = makeAdapter();
    const effects = new ColorEffects(adapter);

    effects.apply('warm', 40, 4200);
    effects.clear();
    effects.clear();

    assert.equal(events.filter(([event]) => event === 'enable-unredirect').length, 1);
});

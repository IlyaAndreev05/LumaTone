import test from 'node:test';
import assert from 'node:assert/strict';

import {MAX_COLOR_TEMPERATURE, MIN_COLOR_TEMPERATURE, sliderValueToTemperature,
    temperatureFactors, temperatureToSliderValue} from '../color-model.js';

test('maps the temperature slider from neutral on the left to warm on the right', () => {
    assert.equal(temperatureToSliderValue(MAX_COLOR_TEMPERATURE), 0);
    assert.equal(temperatureToSliderValue(MIN_COLOR_TEMPERATURE), 1);
    assert.equal(sliderValueToTemperature(0), MAX_COLOR_TEMPERATURE);
    assert.equal(sliderValueToTemperature(1), MIN_COLOR_TEMPERATURE);
    assert.equal(sliderValueToTemperature(temperatureToSliderValue(4980)), 4980);
});

test('keeps neutral temperature and zero strength color-neutral', () => {
    assert.deepEqual(temperatureFactors(MAX_COLOR_TEMPERATURE, 100), {red: 1, green: 1, blue: 1});
    assert.deepEqual(temperatureFactors(MIN_COLOR_TEMPERATURE, 0), {red: 1, green: 1, blue: 1});
});

test('warmer temperatures reduce green and blue, while strength blends back to neutral', () => {
    const fullWarmth = temperatureFactors(MIN_COLOR_TEMPERATURE, 100);
    const mediumWarmth = temperatureFactors(MIN_COLOR_TEMPERATURE, 50);
    const lessWarmTemperature = temperatureFactors(5000, 100);

    assert.ok(fullWarmth.red >= fullWarmth.green);
    assert.ok(fullWarmth.green > fullWarmth.blue);
    assert.ok(mediumWarmth.green > fullWarmth.green);
    assert.ok(mediumWarmth.blue > fullWarmth.blue);
    assert.ok(lessWarmTemperature.blue > fullWarmth.blue);
});

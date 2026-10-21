import test from 'node:test';
import assert from 'node:assert/strict';

import {limitModeIntensity, limitPercent, maximumIntensityForMode, MAX_COLOR_TEMPERATURE, MIN_COLOR_TEMPERATURE, percentToSliderPosition,
    sliderPositionToPercent, sliderValueToTemperature, temperatureFactors,
    temperatureToSliderValue} from '../color-model.js';

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

test('supports deep warm temperatures down to 1000 K', () => {
    assert.equal(MIN_COLOR_TEMPERATURE, 1000);
    assert.equal(sliderValueToTemperature(1), 1000);
    assert.equal(temperatureToSliderValue(1000), 1);
    assert.equal(sliderValueToTemperature(temperatureToSliderValue(1000)), 1000);
    assert.ok(temperatureFactors(1000, 85).blue < temperatureFactors(2700, 85).blue);
});

test('maps a configured percentage cap to its slider endpoint', () => {
    assert.equal(limitPercent(100, 75), 75);
    assert.equal(limitPercent(42, 75), 42);
    assert.equal(limitPercent(42, 0), 0);
    assert.equal(percentToSliderPosition(100, 75), 1);
    assert.equal(percentToSliderPosition(20, 75), 20 / 75);
    assert.equal(percentToSliderPosition(100, 0), 0);
    assert.equal(sliderPositionToPercent(1, 75), 75);
    assert.equal(sliderPositionToPercent(0.5, 75), 38);
    assert.equal(sliderPositionToPercent(1, 0), 0);
});

test('allows monochrome intensity to reach 100% independently of the warm cap', () => {
    const warmMaximum = 85;
    assert.equal(maximumIntensityForMode('warm', warmMaximum), 85);
    assert.equal(limitModeIntensity('warm', 100, warmMaximum), 85);
    assert.equal(percentToSliderPosition(85, maximumIntensityForMode('warm', warmMaximum)), 1);
    assert.equal(maximumIntensityForMode('monochrome', warmMaximum), 100);
    assert.equal(limitModeIntensity('monochrome', 100, warmMaximum), 100);
    assert.equal(sliderPositionToPercent(1, 100), 100);
});

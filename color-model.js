export const MIN_COLOR_TEMPERATURE = 2700;
export const MAX_COLOR_TEMPERATURE = 6500;

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function rgbAtTemperature(kelvin) {
    const temperature = clamp(kelvin, MIN_COLOR_TEMPERATURE, MAX_COLOR_TEMPERATURE) / 100;
    const red = temperature <= 66
        ? 255
        : 329.698727446 * ((temperature - 60) ** -0.1332047592);
    const green = temperature <= 66
        ? 99.4708025861 * Math.log(temperature) - 161.1195681661
        : 288.1221695283 * ((temperature - 60) ** -0.0755148492);
    const blue = temperature >= 66
        ? 255
        : temperature <= 19
            ? 0
            : 138.5177312231 * Math.log(temperature - 10) - 305.0447927307;

    return [red, green, blue].map(channel => clamp(channel, 0, 255) / 255);
}

export function temperatureToSliderValue(kelvin) {
    const temperature = clamp(kelvin, MIN_COLOR_TEMPERATURE, MAX_COLOR_TEMPERATURE);
    return (MAX_COLOR_TEMPERATURE - temperature) /
        (MAX_COLOR_TEMPERATURE - MIN_COLOR_TEMPERATURE);
}

export function sliderValueToTemperature(value) {
    const position = clamp(Number.isFinite(value) ? value : 0, 0, 1);
    return Math.round(MAX_COLOR_TEMPERATURE - position *
        (MAX_COLOR_TEMPERATURE - MIN_COLOR_TEMPERATURE));
}

export function limitPercent(value, maximum) {
    const limit = clamp(Number.isFinite(maximum) ? Math.round(maximum) : 0, 0, 100);
    const percent = clamp(Number.isFinite(value) ? Math.round(value) : 0, 0, 100);
    return Math.min(percent, limit);
}

export function percentToSliderPosition(value, maximum) {
    const limit = clamp(Number.isFinite(maximum) ? Math.round(maximum) : 0, 0, 100);
    return limit === 0 ? 0 : limitPercent(value, limit) / limit;
}

export function sliderPositionToPercent(value, maximum) {
    const limit = clamp(Number.isFinite(maximum) ? Math.round(maximum) : 0, 0, 100);
    const position = clamp(Number.isFinite(value) ? value : 0, 0, 1);
    return Math.round(position * limit);
}

export function temperatureFactors(kelvin, intensity = 100) {
    const [red, green, blue] = rgbAtTemperature(kelvin);
    const [neutralRed, neutralGreen, neutralBlue] = rgbAtTemperature(MAX_COLOR_TEMPERATURE);
    const strength = clamp(Number.isFinite(intensity) ? intensity : 0, 0, 100) / 100;
    const blend = (target, neutral) => 1 + (target / neutral - 1) * strength;

    return {
        red: blend(red, neutralRed),
        green: blend(green, neutralGreen),
        blue: blend(blue, neutralBlue),
    };
}

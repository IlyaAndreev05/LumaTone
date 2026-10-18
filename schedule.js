export function parseTime(value) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function scheduleAt(date, start, end) {
    const startMinute = parseTime(start);
    const endMinute = parseTime(end);
    if (startMinute === null || endMinute === null || startMinute === endMinute)
        return {valid: false, active: false, nextBoundary: 0};
    const minute = date.getHours() * 60 + date.getMinutes();
    const active = startMinute < endMinute
        ? minute >= startMinute && minute < endMinute
        : minute >= startMinute || minute < endMinute;
    const boundary = active ? endMinute : startMinute;
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(),
        Math.floor(boundary / 60), boundary % 60, 0, 0);
    if (next.getTime() <= date.getTime())
        next.setDate(next.getDate() + 1);
    return {valid: true, active, nextBoundary: Math.floor(next.getTime() / 1000)};
}

export function contrastAdjustmentFromIntensity(intensity) {
    const reduction = Math.max(0, Math.min(100, intensity));
    return reduction === 0 ? 0 : -reduction / 100;
}

export function resolveScheduledState(schedule, overrideActive, overrideEnabled, overrideUntil, nowEpoch) {
    if (!schedule.valid)
        return false;
    if (overrideActive && nowEpoch < overrideUntil)
        return overrideEnabled;
    return schedule.active;
}

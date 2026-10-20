function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

/** Own the lifecycle of compositor effects through a small injectable adapter. */
export class ColorEffects {
    constructor(adapter) {
        this._adapter = adapter;
        this._effects = new Map();
        this._unredirectDisabled = false;
        this._mode = null;
    }

    apply(mode, intensity, temperature = 6500, contrastIntensity = 0) {
        intensity = clamp(intensity, 0, 100);
        contrastIntensity = clamp(contrastIntensity, 0, 100);
        const colorActive = intensity > 0 &&
            (mode === 'monochrome' || (mode === 'warm' && temperature < 6500));

        if (!colorActive && contrastIntensity === 0) {
            this.clear();
            return true;
        }

        try {
            if (!this._unredirectDisabled) {
                this._adapter.disableUnredirect();
                this._unredirectDisabled = true;
            }

            if (!colorActive || this._mode !== mode)
                this._removeColorEffects();

            if (colorActive) {
                const kind = mode === 'warm' ? 'warm' : 'monochrome';
                const effect = this._ensureEffect(kind);
                this._adapter.configureEffect(kind, effect, {intensity, temperature});
                this._mode = mode;
            } else {
                this._mode = null;
            }

            if (contrastIntensity > 0) {
                const effect = this._ensureEffect('contrast');
                this._adapter.configureEffect('contrast', effect, {intensity: contrastIntensity});
            } else {
                this._removeEffect('contrast');
            }

            return true;
        } catch (error) {
            this.clear();
            try {
                this._adapter.onError(error);
            } catch (notificationError) {
                this._adapter.onCleanupError(notificationError);
            }
            return false;
        }
    }

    clear() {
        for (const kind of [...this._effects.keys()])
            this._removeEffect(kind);
        this._mode = null;
        if (this._unredirectDisabled) {
            try {
                this._adapter.enableUnredirect();
                this._unredirectDisabled = false;
            } catch (error) {
                this._adapter.onCleanupError(error);
            }
        }
    }

    _ensureEffect(kind) {
        let effect = this._effects.get(kind);
        if (effect)
            return effect;

        effect = this._adapter.createEffect(kind);
        // Track before attaching, so a failed attachment is still cleaned up.
        this._effects.set(kind, effect);
        this._adapter.addEffect(kind, effect);
        return effect;
    }

    _removeColorEffects() {
        this._removeEffect('warm');
        this._removeEffect('monochrome');
    }

    _removeEffect(kind) {
        const effect = this._effects.get(kind);
        if (!effect)
            return;
        this._effects.delete(kind);
        try {
            this._adapter.removeEffect(kind, effect);
        } catch (error) {
            this._adapter.onCleanupError(error);
        }
    }
}

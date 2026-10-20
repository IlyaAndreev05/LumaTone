import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import Cogl from 'gi://Cogl';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {QuickMenuToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import {temperatureFactors, temperatureToSliderValue, sliderValueToTemperature} from './color-model.js';
import {contrastAdjustmentFromIntensity, resolveScheduledState, scheduleAt} from './schedule.js';
import {ColorEffects} from './color-effects.js';

const NIGHT_LIGHT_SCHEMA = 'org.gnome.settings-daemon.plugins.color';
const WarmColorTemperatureEffect = GObject.registerClass(
class WarmColorTemperatureEffect extends Shell.GLSLEffect {
    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, `
            uniform float red_factor;
            uniform float green_factor;
            uniform float blue_factor;
        `, `
            cogl_color_out.r *= red_factor;
            cogl_color_out.g *= green_factor;
            cogl_color_out.b *= blue_factor;
        `, false);
    }

    _init() {
        super._init();
        this._uniforms = ['red_factor', 'green_factor', 'blue_factor']
            .map(name => this.get_uniform_location(name));
        if (this._uniforms.some(location => location < 0))
            throw new Error('Could not find the warm color shader uniforms');
    }

    setFactors(factors) {
        for (const [index, channel] of ['red', 'green', 'blue'].entries())
            this.set_uniform_float(this._uniforms[index], 1, 1, [factors[channel]]);
        this.queue_repaint();
    }
});

function createColorEffects(extension) {
    return new ColorEffects({
        createEffect(kind) {
            if (kind === 'warm')
                return new WarmColorTemperatureEffect();
            if (kind === 'monochrome')
                return new Clutter.DesaturateEffect();
            return new Clutter.BrightnessContrastEffect();
        },
        addEffect(kind, effect) {
            const names = {
                warm: 'lumatone-color-temperature',
                monochrome: 'lumatone-desaturate',
                contrast: 'lumatone-contrast',
            };
            Main.uiGroup.add_effect_with_name(names[kind], effect);
        },
        configureEffect(kind, effect, values) {
            if (kind === 'warm') {
                effect.setFactors(temperatureFactors(values.temperature, values.intensity));
            } else if (kind === 'monochrome') {
                effect.set_factor(values.intensity / 100);
            } else {
                effect.set_contrast(contrastAdjustmentFromIntensity(values.intensity));
            }
        },
        removeEffect(_kind, effect) {
            Main.uiGroup.remove_effect(effect);
        },
        disableUnredirect() {
            global.compositor.disable_unredirect();
        },
        enableUnredirect() {
            global.compositor.enable_unredirect();
        },
        onError(error) {
            logError(error, 'LumaTone failed to apply the color effect');
            Main.notify(_('Night mode was turned off'),
                _('The color effect could not be applied. Check the GNOME Shell log for details.'));
            extension._effectFailed = true;
            extension.effectiveEnabled = false;
            extension.settings?.set_boolean('enabled', false);
            extension._indicator?.toggle._syncMenu();
        },
        onCleanupError(error) {
            logError(error, 'LumaTone could not remove a color effect');
        },
    });
}

const NightToneToggle = GObject.registerClass(
class NightToneToggle extends QuickMenuToggle {
    _init(extension) {
        super._init({
            title: _('Night mode'),
            iconName: 'night-light-symbolic',
            toggleMode: true,
            menuButtonAccessibleName: _('Open LumaTone settings'),
        });
        this._extension = extension;
        this._populateMenu();
        this.connect('notify::checked', () => extension.setEnabled(this.checked, true));
        this.menu.connect('open-state-changed', (_menu, open) => extension._syncMenu(open));
        extension.settings.bind('enabled', this, 'checked', Gio.SettingsBindFlags.DEFAULT);
        extension.settings.connectObject('changed', () => this._syncMenu(), this);
        this._syncMenu();
    }

    _populateMenu() {
        this.menu.setHeader('night-light-symbolic', _('Night mode'));
        this._content = new St.BoxLayout({
            vertical: true,
            style_class: 'quick-settings-grid',
            style: 'spacing: 12px; padding: 6px 8px;',
        });
        this._section = new PopupMenu.PopupMenuSection();
        this._section.box.add_child(this._content);
        this.menu.addMenuItem(this._section);
        const modeRow = new St.BoxLayout({x_expand: true, style_class: 'quick-settings-grid', style: 'spacing: 8px;'});
        this._warm = new St.Button({
            label: _('Warm'),
            style_class: 'button',
            toggle_mode: true,
            x_expand: true,
            can_focus: true,
            accessible_name: _('Warm color mode'),
        });
        this._mono = new St.Button({
            label: _('Black & white'),
            style_class: 'button',
            toggle_mode: true,
            x_expand: true,
            can_focus: true,
            accessible_name: _('Black-and-white color mode'),
        });
        this._warm.connect('clicked', () => {
            this._extension.setMode('warm');
            this._syncMenu();
        });
        this._mono.connect('clicked', () => {
            this._extension.setMode('monochrome');
            this._syncMenu();
        });
        modeRow.add_child(this._warm);
        modeRow.add_child(this._mono);
        this._content.add_child(modeRow);

        this._temperatureGroup = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 6px;',
        });
        const temperatureHeading = new St.BoxLayout({x_expand: true});
        temperatureHeading.add_child(new St.Label({text: _('Color temperature'), x_expand: true}));
        this._temperatureValue = new St.Label({text: '4200 K'});
        temperatureHeading.add_child(this._temperatureValue);
        this._temperatureGroup.add_child(temperatureHeading);
        this._temperatureSlider = new Slider(temperatureToSliderValue(4200));
        this._temperatureSlider.accessible_name = _('Warm color temperature');
        this._temperatureGroup.add_child(this._temperatureSlider);
        const temperatureExtremes = new St.BoxLayout({x_expand: true});
        temperatureExtremes.add_child(new St.Label({text: _('Neutral · 6500 K'), x_expand: true}));
        temperatureExtremes.add_child(new St.Label({text: _('Warm · 2700 K')}));
        this._temperatureGroup.add_child(temperatureExtremes);
        this._content.add_child(this._temperatureGroup);
        this._temperatureSlider.connect('notify::value', () => {
            if (!this._syncing)
                this._extension.setTemperature(sliderValueToTemperature(this._temperatureSlider.value));
        });

        const heading = new St.BoxLayout({x_expand: true});
        this._intensityHeading = new St.Label({text: _('Intensity'), x_expand: true});
        heading.add_child(this._intensityHeading);
        this._percentage = new St.Label({text: '40%'});
        heading.add_child(this._percentage);
        this._content.add_child(heading);
        this._slider = new Slider(.4);
        this._slider.accessible_name = _('Color effect intensity');
        this._content.add_child(this._slider);
        this._slider.connect('notify::value', () => {
            if (!this._syncing)
                this._extension.setIntensity(Math.round(this._slider.value * 100));
        });
        const extremes = new St.BoxLayout({x_expand: true});
        this._left = new St.Label({text: _('No effect'), x_expand: true});
        this._right = new St.Label({text: _('Full strength')});
        extremes.add_child(this._left);
        extremes.add_child(this._right);
        this._content.add_child(extremes);
        this._content.add_child(new PopupMenu.PopupSeparatorMenuItem());
        const contrastHeading = new St.BoxLayout({x_expand: true});
        contrastHeading.add_child(new St.Label({text: _('Contrast'), x_expand: true}));
        this._contrastPercentage = new St.Label({text: '0%'});
        contrastHeading.add_child(this._contrastPercentage);
        this._content.add_child(contrastHeading);
        this._contrastSlider = new Slider(0);
        this._contrastSlider.accessible_name = _('Contrast reduction');
        this._content.add_child(this._contrastSlider);
        this._contrastSlider.connect('notify::value', () => {
            if (!this._syncing)
                this._extension.setContrast(Math.round(this._contrastSlider.value * 100));
        });
        const contrastExtremes = new St.BoxLayout({x_expand: true});
        this._contrastLeft = new St.Label({text: _('Normal contrast'), x_expand: true});
        this._contrastRight = new St.Label({text: _('Lower contrast')});
        contrastExtremes.add_child(this._contrastLeft);
        contrastExtremes.add_child(this._contrastRight);
        this._content.add_child(contrastExtremes);
        this._content.add_child(new PopupMenu.PopupSeparatorMenuItem());
        const actions = new St.BoxLayout({x_expand: true, style: 'spacing: 8px;'});
        const prefs = new St.Button({label: _('Settings'), style_class: 'button', x_expand: true, can_focus: true});
        prefs.connect('clicked', () => this._extension.openPreferences());
        actions.add_child(prefs);
        this._content.add_child(actions);
    }

    _syncMenu() {
        const settings = this._extension.settings;
        const mode = settings.get_string('mode');
        const warm = mode === 'warm';
        const value = settings.get_int(warm ? 'warm-intensity' : 'monochrome-intensity');
        const temperature = settings.get_int('warm-temperature');
        const contrast = settings.get_int('contrast-intensity');
        this._syncing = true;
        this._slider.value = value / 100;
        this._temperatureSlider.value = temperatureToSliderValue(temperature);
        this._contrastSlider.value = contrast / 100;
        this._syncing = false;
        this._temperatureGroup.visible = warm;
        this._temperatureValue.text = `${temperature} K`;
        this._intensityHeading.text = warm ? _('Strength') : _('Intensity');
        this._slider.accessible_name = warm ? _('Warm effect strength') : _('Monochrome intensity');
        this._percentage.text = `${value}%`;
        this._contrastPercentage.text = `${contrast}%`;
        // GNOME's native checked button treatment gives the two modes a clear,
        // mutually exclusive segmented-switch state and keyboard semantics.
        this._warm.checked = warm;
        this._mono.checked = !warm;
        this._left.text = warm ? _('No effect') : _('Normal colors');
        this._right.text = warm ? _('Full strength') : _('Full black & white');
        this._subtitle = this._extension.effectiveEnabled ? _(warm ? 'Warm colors' : 'Black & white') : _('Off');
    }
});

const Indicator = GObject.registerClass(
class Indicator extends SystemIndicator {
    _init(extension) {
        super._init();
        this.toggle = new NightToneToggle(extension);
        this.quickSettingsItems.push(this.toggle);
    }
});

export default class LumaToneExtension extends Extension {
    enable() {
        this.settings = this.getSettings();
        this._nightLight = new Gio.Settings({schema_id: NIGHT_LIGHT_SCHEMA});
        this._nightLightSnapshot = {};
            this._effectFailed = false;
        this.effects = createColorEffects(this);
        try {
            this._restoreStaleNightLightSnapshot();

            // Build and register the new tile before taking over GNOME's controls.
            this._indicator = new Indicator(this);
            Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
            this._monitorManager = global.backend.get_monitor_manager();
            this._monitorManager.connectObject('monitors-changed', () => this._apply(), this);
            Main.sessionMode.connectObject('updated', () => this._updateSchedule(), this);
            this.settings.connectObject('changed::mode', () => this._apply(), this);
            this.settings.connectObject('changed::warm-intensity', () => this._apply(), this);
            this.settings.connectObject('changed::warm-temperature', () => this._apply(), this);
            this.settings.connectObject('changed::monochrome-intensity', () => this._apply(), this);
            this.settings.connectObject('changed::contrast-intensity', () => this._apply(), this);
            this.settings.connectObject('changed::enabled', () => this._apply(), this);
            this.settings.connectObject('changed::schedule-enabled', () => this._updateSchedule(), this);
            this.settings.connectObject('changed::schedule-start', () => this._updateSchedule(), this);
            this.settings.connectObject('changed::schedule-end', () => this._updateSchedule(), this);

            this._saveNightLightSnapshot();
            this._nativeIndicator = Main.panel.statusArea.quickSettings._nightLight;
            this._nativeIndicatorVisible = this._nativeIndicator?.visible ?? false;
            this._nativeItems = [...(this._nativeIndicator?.quickSettingsItems ?? [])].map(item => [item, item.visible]);
            for (const key of ['night-light-schedule-automatic', 'night-light-schedule-from',
                'night-light-schedule-to', 'night-light-temperature']) {
                this._nightLight.connectObject(`changed::${key}`, () => {
                    const value = this._nightLight.get_value(key);
                    this._nightLightSnapshot[key] = value;
                    this.settings.set_value(key, value);
                }, this);
            }
            this._nightLight.connectObject('changed::night-light-enabled', () => {
                if (this._nightLight.get_boolean('night-light-enabled'))
                    this._nightLight.set_boolean('night-light-enabled', false);
            }, this);

            // Only hide the built-in controls after our tile and its menu are ready.
            this._nightLight.set_boolean('night-light-enabled', false);
            if (this._nativeIndicator)
                this._nativeIndicator.visible = false;
            for (const [item] of this._nativeItems)
                item.visible = false;

            this._updateSchedule();
        } catch (error) {
            this.disable();
            throw error;
        }
    }

    _restoreStaleNightLightSnapshot() {
        const settingKeys = ['gnome-night-light-enabled', 'night-light-schedule-automatic',
            'night-light-schedule-from', 'night-light-schedule-to', 'night-light-temperature'];
        const systemKeys = ['night-light-enabled', 'night-light-schedule-automatic',
            'night-light-schedule-from', 'night-light-schedule-to', 'night-light-temperature'];
        if (!this.settings.get_boolean('night-light-snapshot-valid'))
            return;
        for (let i = 0; i < systemKeys.length; i++)
            this._nightLight.set_value(systemKeys[i], this.settings.get_value(settingKeys[i]));
        this.settings.set_boolean('night-light-snapshot-valid', false);
    }

    _saveNightLightSnapshot() {
        const settingKeys = ['gnome-night-light-enabled', 'night-light-schedule-automatic',
            'night-light-schedule-from', 'night-light-schedule-to', 'night-light-temperature'];
        const systemKeys = ['night-light-enabled', 'night-light-schedule-automatic',
            'night-light-schedule-from', 'night-light-schedule-to', 'night-light-temperature'];
        for (let i = 0; i < systemKeys.length; i++) {
            const value = this._nightLight.get_value(systemKeys[i]);
            this.settings.set_value(settingKeys[i], value);
            this._nightLightSnapshot[systemKeys[i]] = value;
        }
        this.settings.set_boolean('night-light-snapshot-valid', true);
    }

    _updateSchedule() {
        if (!this.settings)
            return;
        let enabled = this.settings.get_boolean('enabled');
        const schedule = this.settings.get_boolean('schedule-enabled')
            ? scheduleAt(new Date(), this.settings.get_string('schedule-start'), this.settings.get_string('schedule-end'))
            : {valid: false, active: false, nextBoundary: 0};
        if (schedule.valid) {
            const overrideActive = this.settings.get_boolean('override-active');
            const overrideUntil = this.settings.get_int64('override-until');
            const now = Math.floor(Date.now() / 1000);
            enabled = resolveScheduledState(schedule, overrideActive,
                this.settings.get_boolean('override-enabled'), overrideUntil, now);
            if (!overrideActive || now >= overrideUntil) {
                this.settings.set_boolean('override-active', false);
                this.settings.set_boolean('enabled', enabled);
            }
        } else {
            this.settings.set_boolean('override-active', false);
            if (this.settings.get_boolean('schedule-enabled')) {
                enabled = false;
                this.settings.set_boolean('enabled', false);
            }
        }
        this.effectiveEnabled = enabled && !this._effectFailed;
        this._apply();
        this._indicator?.toggle._syncMenu();
        this._scheduleNextCheck(schedule);
    }

    setEnabled(enabled, manual = false) {
        if (enabled)
            this._effectFailed = false;
        if (manual && this.settings.get_boolean('schedule-enabled')) {
            const schedule = scheduleAt(new Date(), this.settings.get_string('schedule-start'), this.settings.get_string('schedule-end'));
            this.settings.set_boolean('override-active', schedule.valid);
            this.settings.set_boolean('override-enabled', enabled);
            this.settings.set_int64('override-until', schedule.nextBoundary);
        }
        this.effectiveEnabled = enabled;
        this.settings.set_boolean('enabled', enabled);
        this._apply();
        this._indicator?.toggle._syncMenu();
    }

    setMode(mode) {
        if (!['warm', 'monochrome'].includes(mode))
            return;
        this.settings.set_string('mode', mode);
        this._apply();
        this._indicator?.toggle._syncMenu();
    }

    setIntensity(value) {
        const key = this.settings.get_string('mode') === 'warm' ? 'warm-intensity' : 'monochrome-intensity';
        this.settings.set_int(key, Math.clamp(value, 0, 100));
        this._indicator?.toggle._syncMenu();
    }

    setTemperature(value) {
        this.settings.set_int('warm-temperature', Math.clamp(value, 2700, 6500));
        this._indicator?.toggle._syncMenu();
    }

    setContrast(value) {
        this.settings.set_int('contrast-intensity', Math.clamp(value, 0, 100));
        this._indicator?.toggle._syncMenu();
    }

    _apply() {
        if (!this.effects || !this.settings)
            return;
        if (this._effectFailed) {
            this.effectiveEnabled = false;
            this.effects.clear();
            this._indicator?.toggle._syncMenu();
            return;
        }
        const mode = this.settings.get_string('mode');
        const intensity = this.settings.get_int(mode === 'warm' ? 'warm-intensity' : 'monochrome-intensity');
        const temperature = this.settings.get_int('warm-temperature');
        const contrast = this.settings.get_int('contrast-intensity');
        this.effects.apply(mode, this.effectiveEnabled ? intensity : 0, temperature,
            this.effectiveEnabled ? contrast : 0);
    }

    _syncMenu(open) {
        if (open)
            this._indicator?.toggle._syncMenu();
    }

    _scheduleNextCheck(schedule = null) {
        if (this._updateTimer)
            GLib.Source.remove(this._updateTimer);
        this._updateTimer = 0;
        if (!this.settings.get_boolean('schedule-enabled'))
            return;
        const current = schedule ?? (this.settings.get_boolean('schedule-enabled')
            ? scheduleAt(new Date(), this.settings.get_string('schedule-start'), this.settings.get_string('schedule-end'))
            : null);
        if (!current?.valid)
            return;
        const untilBoundary = current?.valid
            ? current.nextBoundary - Math.floor(Date.now() / 1000)
            : 60;
        const delay = Math.max(1, Math.min(60, untilBoundary));
        this._updateTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delay, () => {
            this._updateTimer = 0;
            this._updateSchedule();
            return GLib.SOURCE_REMOVE;
        });
    }

    disable() {
        if (this._updateTimer)
            GLib.Source.remove(this._updateTimer);
        this._updateTimer = 0;
        this.settings?.disconnectObject(this);
        Main.sessionMode.disconnectObject(this);
        this._monitorManager?.disconnectObject(this);
        this._nightLight?.disconnectObject(this);
        this.effects?.clear();
        const quickSettings = Main.panel.statusArea.quickSettings;
        const tile = this._indicator?.toggle;
        if (tile?.get_parent() === quickSettings.menu._grid)
            quickSettings.menu._grid.remove_child(tile);
        if (tile?.menu?.actor?.get_parent() === quickSettings.menu._overlay)
            quickSettings.menu._overlay.remove_child(tile.menu.actor);
        this._indicator?.destroy();
        this._indicator = null;
        if (this._nativeIndicator)
            this._nativeIndicator.visible = this._nativeIndicatorVisible;
        for (const [item, visible] of this._nativeItems ?? [])
            item.visible = visible;
        if (this._nightLightSnapshot) {
            for (const [key, value] of Object.entries(this._nightLightSnapshot))
                this._nightLight.set_value(key, value);
            this.settings.set_boolean('night-light-snapshot-valid', false);
        }
        this.settings = null;
        this._nightLight = null;
    }
}

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {QuickToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import {resolveScheduledState, scheduleAt, saturationFromIntensity, temperatureFromIntensity} from './schedule.js';

const NIGHT_LIGHT_SCHEMA = 'org.gnome.settings-daemon.plugins.color';
class ColorEffects {
    constructor() {
        this._actors = [];
        this._desaturateEffects = [];
        this._unredirectDisabled = false;
    }

    apply(mode, intensity) {
        if (intensity <= 0) {
            this.clear();
            return;
        }
        if (this._mode !== mode) {
            this._removeEffects();
            this._mode = mode;
        }
        if (!this._unredirectDisabled) {
            global.compositor.disable_unredirect();
            this._unredirectDisabled = true;
        }

        if (mode === 'monochrome') {
            if (this._desaturateEffects.length === 0) {
                for (const group of [global.window_group, Main.uiGroup].filter(Boolean)) {
                    const effect = new Clutter.DesaturateEffect();
                    group.add_effect_with_name('lumatone-desaturate', effect);
                    this._desaturateEffects.push({group, effect});
                }
            }
            for (const {effect} of this._desaturateEffects)
                effect.set_factor(intensity / 100);
        } else {
            const monitors = Main.layoutManager.monitors;
            while (this._actors.length > monitors.length)
                this._actors.pop().destroy();
            for (let i = 0; i < monitors.length; i++) {
                const monitor = monitors[i];
                let actor = this._actors[i];
                if (!actor) {
                    actor = new Clutter.Actor({
                        reactive: false,
                        can_focus: false,
                        name: 'lumatone-warm-screen-layer',
                    });
                    Main.uiGroup.add_child(actor);
                    this._actors.push(actor);
                }
                actor.set_background_color(new Cogl.Color({
                    red: 255, green: 167, blue: 78,
                    alpha: Math.round(255 * 0.48 * intensity / 100),
                }));
                actor.set_position(monitor.x, monitor.y);
                actor.set_size(monitor.width, monitor.height);
            }
        }
    }

    clear() {
        this._removeEffects();
        this._mode = null;
        if (this._unredirectDisabled) {
            global.compositor.enable_unredirect();
            this._unredirectDisabled = false;
        }
    }

    _removeEffects() {
        for (const {group, effect} of this._desaturateEffects) {
            try {
                group.remove_effect(effect);
            } catch (error) {
                // GNOME can tear down the scene graph before an extension's disable hook runs.
            }
        }
        this._desaturateEffects = [];
        for (const actor of this._actors)
            actor.destroy();
        this._actors = [];
    }
}

const NightToneToggle = GObject.registerClass(
class NightToneToggle extends QuickToggle {
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
        this._content = new St.BoxLayout({vertical: true, style_class: 'quick-settings-grid'});
        this._section = new PopupMenu.PopupMenuSection();
        this._section.box.add_child(this._content);
        this.menu.addMenuItem(this._section);
        const modeRow = new St.BoxLayout({x_expand: true, style_class: 'quick-settings-grid'});
        this._warm = new St.Button({label: _('Warm'), style_class: 'button', x_expand: true, can_focus: true});
        this._mono = new St.Button({label: _('Black & white'), style_class: 'button', x_expand: true, can_focus: true});
        this._warm.connect('clicked', () => this._extension.setMode('warm'));
        this._mono.connect('clicked', () => this._extension.setMode('monochrome'));
        modeRow.add_child(this._warm);
        modeRow.add_child(this._mono);
        this._content.add_child(modeRow);
        const heading = new St.BoxLayout({x_expand: true});
        heading.add_child(new St.Label({text: _('Intensity'), x_expand: true}));
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
        this._left = new St.Label({text: _('No warming'), x_expand: true});
        this._right = new St.Label({text: _('Maximum warmth')});
        extremes.add_child(this._left);
        extremes.add_child(this._right);
        this._content.add_child(extremes);
        const detailsTitle = new St.Label({text: _('Effect details'), style_class: 'dim-label'});
        this._details = new St.Label({text: _('Temperature ~4980 K'), x_align: Clutter.ActorAlign.START});
        this._content.add_child(new PopupMenu.PopupSeparatorMenuItem());
        this._content.add_child(detailsTitle);
        this._content.add_child(this._details);
        const actions = new St.BoxLayout({x_expand: true});
        const reset = new St.Button({label: _('Reset effects'), style_class: 'button', x_expand: true, can_focus: true});
        reset.connect('clicked', () => this._extension.resetEffects());
        const prefs = new St.Button({label: _('Settings'), style_class: 'button', can_focus: true});
        prefs.connect('clicked', () => this._extension.openPreferences());
        actions.add_child(reset);
        actions.add_child(prefs);
        this._content.add_child(actions);
    }

    _syncMenu() {
        const settings = this._extension.settings;
        const mode = settings.get_string('mode');
        const warm = mode === 'warm';
        const value = settings.get_int(warm ? 'warm-intensity' : 'monochrome-intensity');
        this._syncing = true;
        this._slider.value = value / 100;
        this._syncing = false;
        this._percentage.text = `${value}%`;
        this._warm.toggle_style_class_name('active', warm);
        this._mono.toggle_style_class_name('active', !warm);
        this._left.text = warm ? _('No warming') : _('Normal colors');
        this._right.text = warm ? _('Maximum warmth') : _('Full black & white');
        this._details.text = warm
            ? _('Temperature ~%d K').format(temperatureFromIntensity(value))
            : _('Saturation %d%%').format(saturationFromIntensity(value));
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
        this._restoreStaleNightLightSnapshot();
        this._saveNightLightSnapshot();
        // Retain GNOME's preference and schedule; keep its effect and controls out of the active session.
        this._nightLight.set_boolean('night-light-enabled', false);
        this._nightLight.connectObject('changed::night-light-enabled', () => {
            if (this._nightLight.get_boolean('night-light-enabled'))
                this._nightLight.set_boolean('night-light-enabled', false);
        }, this);
        for (const key of ['night-light-schedule-automatic', 'night-light-schedule-from',
            'night-light-schedule-to', 'night-light-temperature']) {
            this._nightLight.connectObject(`changed::${key}`, () => {
                const value = this._nightLight.get_value(key);
                this._nightLightSnapshot[key] = value;
                this.settings.set_value(key, value);
            }, this);
        }
        this._nativeIndicator = Main.panel.statusArea.quickSettings._nightLight;
        this._nativeIndicatorVisible = this._nativeIndicator?.visible ?? false;
        this._nativeItems = [...(this._nativeIndicator?.quickSettingsItems ?? [])].map(item => [item, item.visible]);
        if (this._nativeIndicator)
            this._nativeIndicator.visible = false;
        for (const [item] of this._nativeItems)
            item.visible = false;

        this.effects = new ColorEffects();
        this._monitorManager = global.backend.get_monitor_manager();
        this._monitorManager.connectObject('monitors-changed', () => this._apply(), this);
        this._indicator = new Indicator(this);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
        this._updateTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
            this._updateTimer = 0;
            this._updateSchedule();
            return GLib.SOURCE_REMOVE;
        });
        this._updateSchedule();
        Main.sessionMode.connectObject('updated', () => this._updateSchedule(), this);
        this.settings.connectObject('changed::mode', () => this._apply(), this);
        this.settings.connectObject('changed::warm-intensity', () => this._apply(), this);
        this.settings.connectObject('changed::monochrome-intensity', () => this._apply(), this);
        this.settings.connectObject('changed::enabled', () => this._apply(), this);
        this.settings.connectObject('changed::schedule-enabled', () => this._updateSchedule(), this);
        this.settings.connectObject('changed::schedule-start', () => this._updateSchedule(), this);
        this.settings.connectObject('changed::schedule-end', () => this._updateSchedule(), this);
        this._apply();
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
        this.effectiveEnabled = enabled;
        this._apply();
        this._indicator?.toggle._syncMenu();
        this._scheduleNextCheck(schedule);
    }

    setEnabled(enabled, manual = false) {
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

    resetEffects() {
        this.setEnabled(false, true);
    }

    _apply() {
        if (!this.effects || !this.settings)
            return;
        const mode = this.settings.get_string('mode');
        const intensity = this.settings.get_int(mode === 'warm' ? 'warm-intensity' : 'monochrome-intensity');
        this.effects.apply(mode, this.effectiveEnabled ? intensity : 0);
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

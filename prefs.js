import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class LumaTonePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.title = _('LumaTone — Night mode');
        window.default_width = 540;
        window.default_height = 460;

        const page = new Adw.PreferencesPage({title: _('Night mode'), icon_name: 'night-light-symbolic'});
        const schedule = new Adw.PreferencesGroup({title: _('Schedule'), description: _('Choose the daily time when the color effect starts and ends.')});
        const enabled = new Adw.SwitchRow({title: _('Automatic schedule')});
        settings.bind('schedule-enabled', enabled, 'active', Gio.SettingsBindFlags.DEFAULT);
        const start = new Adw.EntryRow({title: _('Start time'), text: settings.get_string('schedule-start')});
        const end = new Adw.EntryRow({title: _('End time'), text: settings.get_string('schedule-end')});
        const validation = new Gtk.Label({label: '', wrap: true, xalign: 0, visible: false});
        const updateTimes = () => {
            const validStart = /^([01]\d|2[0-3]):[0-5]\d$/.test(start.text);
            const validEnd = /^([01]\d|2[0-3]):[0-5]\d$/.test(end.text);
            const equal = validStart && validEnd && start.text === end.text;
            const valid = validStart && validEnd && !equal;
            validation.label = valid ? '' : equal
                ? _('Start and end times must differ.')
                : _('Enter both times in 24-hour HH:MM format.');
            validation.visible = !valid;
            if (validStart)
                start.remove_css_class('error');
            else
                start.add_css_class('error');
            if (validEnd)
                end.remove_css_class('error');
            else
                end.add_css_class('error');
            if (valid) {
                settings.set_string('schedule-start', start.text);
                settings.set_string('schedule-end', end.text);
            }
        };
        start.connect('changed', updateTimes);
        end.connect('changed', updateTimes);
        enabled.connect('notify::active', () => {
            start.sensitive = enabled.active;
            end.sensitive = enabled.active;
        });
        start.sensitive = enabled.active;
        end.sensitive = enabled.active;
        const help = new Gtk.Label({label: _('Use 24-hour local time (HH:MM). Intervals can pass midnight.'), wrap: true, xalign: 0});
        schedule.add(enabled);
        schedule.add(start);
        schedule.add(end);
        schedule.add(help);
        schedule.add(validation);
        updateTimes();

        const behavior = new Adw.PreferencesGroup({title: _('Behavior')});
        const priority = new Adw.ActionRow({title: _('Night Light GNOME'), subtitle: _('LumaTone pauses the built-in effect while this extension is enabled and restores its previous setting when disabled.')});
        behavior.add(priority);

        page.add(schedule);
        page.add(behavior);
        window.add(page);
    }
}

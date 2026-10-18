# LumaTone — Night Display

LumaTone adds warm and black-and-white color modes, plus a contrast-reduction slider, to GNOME Shell 50 Quick Settings. The effects are applied by the compositor across active monitors and full-screen windows. A daily local-time schedule can enable them automatically.

## Install

Build and install from this directory:

```sh
make pack
gnome-extensions install --force dist/lumatone@ilyaandreev05.github.io.shell-extension.zip
```

Log out and back in if the extension is not loaded, then enable **LumaTone — Night Display** in Extensions. Open its settings from Extensions or run `gnome-extensions prefs lumatone@ilyaandreev05.github.io`.

The warm mode uses a compositor color layer to tint the image; the monochrome mode uses Clutter's desaturation effect. Contrast reduction uses Clutter's brightness/contrast effect. Disabling the extension removes its effects and restores the GNOME Night Light preference and schedule captured at startup.

## Development

The extension targets GNOME Shell 50, GJS ES modules, GTK4, and libadwaita. Run `make check` to validate JavaScript syntax, schedule calculations, schemas, Russian translations, and the extension bundle.

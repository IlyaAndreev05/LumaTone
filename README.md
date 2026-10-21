# LumaTone — Night Display

LumaTone adds warm and black-and-white color modes, plus a contrast-reduction slider, to GNOME Shell 50 Quick Settings. Warm mode has separate color-temperature (1000–6500 K) and strength controls; black-and-white keeps its saturation and contrast controls. The effects are applied by the compositor across active monitors and full-screen windows. A daily local-time schedule can enable them automatically.

The preferences window includes configurable maximum values for warm strength and contrast reduction. Both limits default to 85%; the warm-strength limit does not cap black-and-white intensity, which remains adjustable up to 100%. Contrast reduction is capped in both modes. Each mode retains its own selected intensity.

## Install

Build and install from this directory:

```sh
make pack
gnome-extensions install --force dist/lumatone@ilyaandreev05.github.io.shell-extension.zip
```

Log out and back in if the extension is not loaded, then enable **LumaTone — Night Display** in Extensions. Open its settings from Extensions or run `gnome-extensions prefs lumatone@ilyaandreev05.github.io`.

The warm mode uses a compositor shader to apply per-channel color-temperature correction, with strength blending the selected temperature toward neutral. The monochrome mode uses Clutter's desaturation effect. Contrast reduction uses Clutter's brightness/contrast effect. Disabling the extension removes its effects and restores the GNOME Night Light preference and schedule captured at startup.

## Development

The extension targets GNOME Shell 50, GJS ES modules, GTK4, and libadwaita. Run `make check` to validate JavaScript syntax, schedule calculations, schemas, Russian translations, and the extension bundle.

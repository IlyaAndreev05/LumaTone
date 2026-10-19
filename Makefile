UUID := lumatone@ilyaandreev05.github.io
BUILD_DIR := $(CURDIR)/build/extension
ZIP := $(CURDIR)/dist/$(UUID).shell-extension.zip

.PHONY: check test syntax schemas pack clean

check: syntax test schemas pack

syntax:
	@set -eu; for file in extension.js prefs.js schedule.js color-model.js tests/schedule.test.js tests/color-model.test.js; do node --check --input-type=module < "$$file"; done

test:
	node --test tests/*.test.js

schemas:
	glib-compile-schemas --strict --dry-run schemas

pack:
	@set -eu; rm -rf "$(BUILD_DIR)"; mkdir -p "$(BUILD_DIR)" "$(dir $(ZIP))"; \
	cp metadata.json extension.js prefs.js schedule.js color-model.js "$(BUILD_DIR)/"; cp -r schemas "$(BUILD_DIR)/"; \
	glib-compile-schemas --strict "$(BUILD_DIR)/schemas"; \
	msgfmt --check --output-file=/dev/null po/ru.po; \
	gnome-extensions pack --force --gettext-domain "$(UUID)" --podir="$(CURDIR)/po" --extra-source="$(BUILD_DIR)/schedule.js" --extra-source="$(BUILD_DIR)/color-model.js" --out-dir "$(dir $(ZIP))" "$(BUILD_DIR)"; \
	test -s "$(ZIP)"

clean:
	rm -rf build dist

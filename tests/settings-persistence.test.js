import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdtempSync, mkdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const schemaId = 'io.github.ilyaandreev05.lumatone';
const schemaFile = 'io.github.ilyaandreev05.lumatone.gschema.xml';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('GSettings persists effect limits and separate mode strengths between processes', t => {
    const root = mkdtempSync(join(tmpdir(), 'lumatone-settings-'));
    t.after(() => rmSync(root, {recursive: true, force: true}));

    const schemaDir = join(root, 'schemas');
    const configDir = join(root, 'config');
    mkdirSync(schemaDir);
    mkdirSync(configDir);
    copyFileSync(join(projectRoot, 'schemas', schemaFile), join(schemaDir, schemaFile));
    execFileSync('glib-compile-schemas', ['--strict', schemaDir]);

    const env = {
        ...process.env,
        GSETTINGS_BACKEND: 'keyfile',
        GSETTINGS_SCHEMA_DIR: schemaDir,
        XDG_CONFIG_HOME: configDir,
    };
    const get = key => execFileSync('gsettings', ['get', schemaId, key], {env, encoding: 'utf8'}).trim();
    const set = (key, value) => execFileSync('gsettings', ['set', schemaId, key, String(value)], {env});

    assert.equal(get('max-effect-strength'), '75');
    assert.equal(get('max-contrast-intensity'), '75');

    set('max-effect-strength', 61);
    set('max-contrast-intensity', 69);
    set('warm-intensity', 55);
    set('monochrome-intensity', 64);
    set('mode', "'monochrome'");

    assert.equal(get('mode'), "'monochrome'");
    assert.equal(get('max-effect-strength'), '61');
    assert.equal(get('max-contrast-intensity'), '69');
    assert.equal(get('warm-intensity'), '55');
    assert.equal(get('monochrome-intensity'), '64');
});

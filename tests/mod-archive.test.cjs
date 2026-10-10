const test = require('node:test');
const assert = require('node:assert/strict');
const { zipSync } = require('fflate');
const { assertForgeMod } = require('../electron/mod-archive.cjs');

test('rejects LabyMod add-ons with a clear compatibility explanation', () => {
  for (const [file, addon] of [
    ['Anti Clear Chat.jar', { name: 'Anti Clear Chat', mainClass: 'de.cosmo.AntiClearChatAddon' }],
    ['Resourcepacks24.jar', { name: 'Resourcepacks24', requiredVersion: '3.4.9' }],
  ]) {
    const entries = { 'addon.json': new TextEncoder().encode(JSON.stringify(addon)) };
    if (file === 'Anti Clear Chat.jar')
      entries['de/cosmo/AntiClearChatAddon.class'] = new TextEncoder().encode(
        'references net/labymod/api/LabyModAddon',
      );
    assert.throws(() => assertForgeMod(file, zipSync(entries)), /complemento de LabyMod.*Primarix no incluye LabyMod/);
  }
});

test('uses the add-on main class to confirm LabyMod instead of rejecting arbitrary addon metadata', () => {
  const addon = { name: 'Example', mainClass: 'example.ForgeMod' };
  const archive = zipSync({
    'addon.json': new TextEncoder().encode(JSON.stringify(addon)),
    'example/ForgeMod.class': new TextEncoder().encode('Forge mod main class'),
  });
  assert.doesNotThrow(() => assertForgeMod('Example.jar', archive));

  const labyAddon = zipSync({
    'addon.json': new TextEncoder().encode(
      JSON.stringify({ name: 'Anti Clear Chat', mainClass: 'de.cosmo.AntiClearChatAddon' }),
    ),
    'de/cosmo/AntiClearChatAddon.class': new TextEncoder().encode('references net/labymod/api/LabyModAddon'),
  });
  assert.throws(() => assertForgeMod('Anti Clear Chat.jar', labyAddon), /complemento de LabyMod/);
});

test('rejects LabyMod core-mod dependencies even when no add-on manifest exists', () => {
  const manifest = new TextEncoder().encode(
    'Manifest-Version: 1.0\nFMLCorePlugin: net.labymod.core.asm.LabyModCoreMod\n',
  );
  assert.throws(
    () => assertForgeMod('DamageIndicator.jar', zipSync({ 'META-INF/MANIFEST.MF': manifest })),
    /complemento de LabyMod/,
  );
});

test('allows a standard Forge mod archive and rejects corrupt JAR data', () => {
  const mod = zipSync({ 'mcmod.info': new TextEncoder().encode('[{"modid":"example","name":"Example"}]') });
  assert.doesNotThrow(() => assertForgeMod('Example.jar', mod));
  assert.throws(() => assertForgeMod('Broken.jar', new TextEncoder().encode('not a jar')), /JAR válido/);
});

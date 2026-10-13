const fs = require('node:fs');
const { atomicWrite } = require('./files.cjs');

const WINDOWS_1252 = new Map([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);
const WINDOWS_1252_DECODE = new Map([...WINDOWS_1252].map(([character, byte]) => [byte, character]));

function decodeGameOptions(buffer) {
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(buffer),
      encoding: 'utf8',
    };
  } catch {
    let text = '';
    for (const byte of buffer) {
      const character = WINDOWS_1252_DECODE.get(byte) ?? byte;
      text += String.fromCodePoint(character);
    }
    return { text, encoding: 'windows-1252' };
  }
}

function encodeGameOptions(text, encoding) {
  if (encoding !== 'windows-1252') return Buffer.from(text, 'utf8');
  const bytes = [];
  for (const character of text) {
    const code = character.codePointAt(0);
    if (code <= 0x7f || (code >= 0xa0 && code <= 0xff)) bytes.push(code);
    else if (WINDOWS_1252.has(code)) bytes.push(WINDOWS_1252.get(code));
    else if (code >= 0x80 && code <= 0x9f) bytes.push(code);
    else bytes.push(0x3f);
  }
  return Buffer.from(bytes);
}

function readGameOptions(file) {
  return decodeGameOptions(fs.readFileSync(file));
}

function writeGameOptions(file, text, encoding) {
  atomicWrite(file, encodeGameOptions(text, encoding));
}

module.exports = { decodeGameOptions, encodeGameOptions, readGameOptions, writeGameOptions };

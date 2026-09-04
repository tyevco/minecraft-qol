/**
 * Turn experiments on in a Bedrock world's `level.dat`.
 *
 * Experiments cannot be set from `server.properties` - they have to arrive with
 * the world (`docs/gametest-structure-results.md`), which on a desktop means
 * copying a world a person made in the client. That is not available in CI, so
 * this edits the flag directly in the world BDS generates on its first boot.
 *
 *   node tools/bds/enable-experiments.mjs <world-dir> [flag ...]
 *
 * The default flag is `gametest`, which is the "Beta APIs" toggle - the one
 * `@minecraft/server-gametest` needs. A correct boot afterwards logs
 * `Experiment(s) active: gtst`.
 *
 * level.dat is uncompressed little-endian NBT behind an 8-byte header (storage
 * version, then the body length). A fresh world already carries an `experiments`
 * compound holding `experiments_ever_used` and `saved_with_toggled_experiments`,
 * both 0; this rewrites that one compound in place and fixes the length header,
 * leaving every other byte of the file untouched. Re-running is safe.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [worldDir, ...flagArgs] = process.argv.slice(2);
if (!worldDir) {
  console.error("usage: node tools/bds/enable-experiments.mjs <world-dir> [flag ...]");
  process.exit(2);
}
const flags = flagArgs.length ? flagArgs : ["gametest"];

const TAG_END = 0;
const TAG_COMPOUND = 10;

/** Byte length of one tag payload, so an unknown neighbour can be stepped over. */
function payloadEnd(buf, type, at) {
  switch (type) {
    case 1:
      return at + 1;
    case 2:
      return at + 2;
    case 3:
    case 5:
      return at + 4;
    case 4:
    case 6:
      return at + 8;
    case 7:
      return at + 4 + buf.readInt32LE(at);
    case 8:
      return at + 2 + buf.readUInt16LE(at);
    case 9: {
      const itemType = buf.readInt8(at);
      const count = buf.readInt32LE(at + 1);
      let p = at + 5;
      for (let i = 0; i < count; i++) p = payloadEnd(buf, itemType, p);
      return p;
    }
    case 10:
      return compoundEnd(buf, at);
    case 11:
      return at + 4 + buf.readInt32LE(at) * 4;
    case 12:
      return at + 4 + buf.readInt32LE(at) * 8;
    default:
      throw new Error(`unknown NBT tag ${type} at ${at}`);
  }
}

/** Offset just past a compound's TAG_End, given the offset of its first entry. */
function compoundEnd(buf, at) {
  let p = at;
  for (;;) {
    const type = buf.readInt8(p);
    p += 1;
    if (type === TAG_END) return p;
    p += 2 + buf.readUInt16LE(p); // name
    p = payloadEnd(buf, type, p);
  }
}

/** A compound of byte tags, as an NBT payload. */
function byteCompound(entries) {
  const parts = [];
  for (const [name, value] of entries) {
    const name8 = Buffer.from(name, "utf8");
    const head = Buffer.alloc(3);
    head.writeInt8(1, 0);
    head.writeUInt16LE(name8.length, 1);
    parts.push(head, name8, Buffer.from([value & 0xff]));
  }
  parts.push(Buffer.from([TAG_END]));
  return Buffer.concat(parts);
}

const levelDat = join(worldDir, "level.dat");
const file = readFileSync(levelDat);
const storageVersion = file.readInt32LE(0);
const body = file.subarray(8);

// tag 10, name length 11, "experiments"
const marker = Buffer.concat([
  Buffer.from([TAG_COMPOUND, 0x0b, 0x00]),
  Buffer.from("experiments", "utf8"),
]);
const found = body.indexOf(marker);
if (found < 0) {
  console.error(`no "experiments" compound in ${levelDat}; is this a Bedrock level.dat?`);
  process.exit(1);
}

const start = found + marker.length; // first entry of the compound
const end = compoundEnd(body, start); // past its TAG_End

// Read what is there so re-running does not drop a flag someone else set.
const existing = new Map();
for (let p = start; ; ) {
  const type = body.readInt8(p);
  p += 1;
  if (type === TAG_END) break;
  const nameLen = body.readUInt16LE(p);
  const name = body.subarray(p + 2, p + 2 + nameLen).toString("utf8");
  p += 2 + nameLen;
  const next = payloadEnd(body, type, p);
  if (type === 1) existing.set(name, body.readInt8(p));
  p = next;
}

for (const flag of flags) existing.set(flag, 1);
existing.set("experiments_ever_used", 1);
existing.set("saved_with_toggled_experiments", 1);

const rebuilt = Buffer.concat([
  body.subarray(0, start),
  byteCompound([...existing]),
  body.subarray(end),
]);

const header = Buffer.alloc(8);
header.writeInt32LE(storageVersion, 0);
header.writeInt32LE(rebuilt.length, 4);
writeFileSync(levelDat, Buffer.concat([header, rebuilt]));

console.log(`${levelDat}: experiments ${[...existing].map(([k, v]) => `${k}=${v}`).join(" ")}`);

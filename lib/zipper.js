'use strict';
/* كاتب ZIP بسيط من غير مكتبات (deflate + CRC32) — بيكتب على أي stream (زي رد السيرفر) ملف ورا ملف.
   بيُستخدم في «نزّل كل حاجة للنقل» من لوحة التحكم. */
const zlib = require('zlib');

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function dosTime(d) { return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }; }

function createZip(out) {
  const central = []; let offset = 0;
  const write = (b) => new Promise((res, rej) => { offset += b.length; if (out.write(b)) return res(); out.once('drain', res); out.once('error', rej); });
  return {
    async add(name, data, mtime) {
      const nameBuf = Buffer.from(name.replace(/\\/g, '/'), 'utf8'); const raw = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
      const comp = zlib.deflateRawSync(raw, { level: 6 }); const useStore = comp.length >= raw.length; const body = useStore ? raw : comp;
      const crc = crc32(raw); const { time, date } = dosTime(mtime || new Date()); const at = offset;
      const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(useStore ? 0 : 8, 8); h.writeUInt16LE(time, 10); h.writeUInt16LE(date, 12);
      h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nameBuf.length, 26); h.writeUInt16LE(0, 28);
      await write(h); await write(nameBuf); await write(body);
      central.push({ nameBuf, crc, csize: body.length, size: raw.length, method: useStore ? 0 : 8, time, date, at });
    },
    async end() {
      const start = offset; for (const e of central) { const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(e.method, 10); c.writeUInt16LE(e.time, 12); c.writeUInt16LE(e.date, 14);
        c.writeUInt32LE(e.crc, 16); c.writeUInt32LE(e.csize, 20); c.writeUInt32LE(e.size, 24); c.writeUInt16LE(e.nameBuf.length, 28); c.writeUInt32LE(e.at, 42); await write(c); await write(e.nameBuf); }
      const size = offset - start; const z = Buffer.alloc(22); z.writeUInt32LE(0x06054b50, 0); z.writeUInt16LE(central.length, 8); z.writeUInt16LE(central.length, 10); z.writeUInt32LE(size, 12); z.writeUInt32LE(start, 16);
      await write(z); out.end();
    }
  };
}
module.exports = { createZip, crc32 };

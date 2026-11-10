/**
 * 零依赖 ZIP 打包器（Store 模式，不压缩，仅归档）。
 *
 * 为什么自己写：本工具坚持「零 npm 依赖、纯前端」。文件本身（尤其是已经
 * 压缩过的 jpg/webp/zip）再做 DEFLATE 收益很小，却要引入 JSZip 这类库；
 * Store 模式的 ZIP 被 Windows 资源管理器 / macOS 访达 / 所有解压软件原生支持。
 *
 * 实现要点：本地文件头 + 文件数据 + 中央目录 + EOCD；通用位标志 bit11 = UTF-8 文件名。
 */

// CRC-32 查表（IEEE 802.3 多项式 0xEDB88320）
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS 时间戳：高 16 位时间、低 16 位日期 */
function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  return { dosDate, dosTime };
}

/**
 * 生成 ZIP 文件。
 * @param {{name: string, blob: Blob}[]} entries
 * @returns {Promise<Blob>}
 */
export async function createZip(entries) {
  if (!entries.length) throw new Error('没有可打包的文件');

  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  const { dosDate, dosTime } = dosDateTime(new Date());
  let offset = 0;

  for (const entry of entries) {
    // ZIP 内不允许绝对路径与盘符，统一去掉
    const name = String(entry.name).replace(/[\\/]/g, '_').replace(/^:/, '');
    const nameBytes = encoder.encode(name);
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    const crc = crc32(data);

    // ---- 本地文件头（30 字节固定部分） ----
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // 签名 PK\x03\x04
    lv.setUint16(4, 20, true); // 解压所需版本 2.0
    lv.setUint16(6, 0x0800, true); // 标志：文件名使用 UTF-8
    lv.setUint16(8, 0, true); // 压缩方法 0 = Store
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); // 压缩后大小
    lv.setUint32(22, data.length, true); // 原始大小
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // 附加字段长度
    local.set(nameBytes, 30);

    chunks.push(local, data);

    // ---- 中央目录项（46 字节固定部分） ----
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); // 签名 PK\x01\x02
    cv.setUint16(4, 20, true); // 制作版本
    cv.setUint16(6, 20, true); // 解压所需版本
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // 附加字段
    cv.setUint16(32, 0, true); // 注释
    cv.setUint16(34, 0, true); // 起始磁盘号
    cv.setUint16(36, 0, true); // 内部属性
    cv.setUint32(38, 0, true); // 外部属性
    cv.setUint32(42, offset, true); // 本地头偏移
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + data.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);

  // ---- EOCD（End Of Central Directory，22 字节） ----
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // 签名 PK\x05\x06
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true); // 注释长度

  return new Blob([...chunks, ...central, eocd], { type: 'application/zip' });
}

/** 通用工具函数：字节格式化、文件名处理、下载、类型判断。 */

/** 人类可读的文件大小 */
export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

/** 变化比例描述。返回 null 表示无需展示（大小没变） */
export function sizeChangeText(sourceSize, outputSize) {
  if (!sourceSize || !outputSize || sourceSize === outputSize) return null;
  const ratio = ((sourceSize - outputSize) / sourceSize) * 100;
  const abs = Math.abs(ratio).toFixed(1);
  return ratio > 0 ? `体积减小 ${abs}%` : `体积增大 ${abs}%`;
}

/** 取小写扩展名（不含点） */
export function getExtension(name) {
  const base = String(name).split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/** 去掉扩展名的文件名主体 */
export function stripExtension(name) {
  const base = String(name).split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/** 替换扩展名；ext 可带或不带前导点 */
export function replaceExtension(name, ext) {
  const clean = String(ext || '').trim().replace(/^\.+/, '');
  return clean ? `${stripExtension(name)}.${clean}` : stripExtension(name);
}

/** 触发浏览器下载（blob 或 URL） */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 交给浏览器完成读取后再释放
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** 常用图片扩展名 */
export const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'svg', 'tiff', 'ico'];

/** 依据扩展名或 MIME 判断是否为图片 */
export function isImageFile(file) {
  if (file.type && file.type.startsWith('image/')) return true;
  return IMAGE_EXTS.includes(getExtension(file.name));
}

/** 扩展名 → 浏览器可输出的 MIME；不支持则返回 null */
export function mimeFromExt(ext) {
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
  };
  return map[String(ext || '').toLowerCase().replace(/^\./, '')] || null;
}

/** MIME → 推荐扩展名 */
export function extFromMime(mime) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
  };
  return map[mime] || 'bin';
}

/** 把未知异常转换成友好的中文提示 */
export function friendlyError(err) {
  if (!err) return '发生未知错误';
  const msg = typeof err === 'string' ? err : err.message || String(err);
  if (/out of memory|allocation/i.test(msg)) return '文件太大，浏览器内存不足。请尝试更少或更小的文件。';
  if (/decode|corrupt|invalid image|source/i.test(msg)) return '无法解码该文件，可能是文件损坏或格式不受支持。';
  return msg;
}

/**
 * 校验文件是否符合 accept（形如 "image/*,.png,image/jpeg"）。
 * @returns {boolean}
 */
export function matchesAccept(file, acceptList) {
  if (!acceptList || acceptList.length === 0) return true;
  const ext = `.${getExtension(file.name)}`;
  const mime = (file.type || '').toLowerCase();
  return acceptList.some((rule) => {
    const r = String(rule).trim().toLowerCase();
    if (!r) return false;
    if (r.endsWith('/*')) return mime.startsWith(r.slice(0, -1));
    if (r.startsWith('.')) return ext === r;
    return mime === r;
  });
}

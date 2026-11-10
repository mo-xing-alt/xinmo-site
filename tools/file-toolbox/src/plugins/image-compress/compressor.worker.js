/**
 * 图片压缩 Worker：用 OffscreenCanvas 在后台线程完成缩放与重新编码，
 * 主线程只负责解码与 UI，因此处理大图时页面不会卡住。
 *
 * 若浏览器不支持 OffscreenCanvas / module worker，主线程会自动回退到
 * 普通 <canvas>，功能不受影响，只是处理期间可能短暂阻塞 UI。
 *
 * 注意：ImageBitmap 由主线程创建并负责 close()，本 Worker 不关闭它。
 */
self.onmessage = async (event) => {
  const { id, bitmap, mime, quality, maxEdge } = event.data;
  try {
    if (typeof OffscreenCanvas === 'undefined') {
      throw new Error('当前浏览器不支持 OffscreenCanvas');
    }
    let width = bitmap.width;
    let height = bitmap.height;

    // 最长边等比缩放（不是拉伸，保持宽高比）
    if (maxEdge > 0 && Math.max(width, height) > maxEdge) {
      const scale = maxEdge / Math.max(width, height);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法获取 OffscreenCanvas 2D 上下文');

    // JPEG 不支持透明通道：先铺白底，避免透明区域变成黑块
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await canvas.convertToBlob({ type: mime, quality });
    self.postMessage({ id, ok: true, blob, width, height });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || String(err) });
  }
};

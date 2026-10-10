/** 图片存储（Web 全栈版）：客户端压缩为 dataURL 直接入库（PG TEXT 列）。
 * 不再有对象存储——实例回收/换机都无损，图片随行数据走。
 * uploadImage/tempUrls 签名与云存储时代一致，消费点零改动。 */

/** 压缩 File → JPEG dataURL（最长边 1280，质量 0.82，典型 ~150-300KB） */
async function compressToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画布不可用');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.82);
}

export async function uploadImage(file: File, _kind: 'avatar' | 'cover' | 'journal'): Promise<string> {
  return compressToDataUrl(file);
}

/** 兼容旧消费点：dataURL 时代的「临时链接换表」就是恒等映射。 */
export async function tempUrls(fileIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const id of fileIds) if (id) out[id] = id;
  return out;
}

/** 云存储封装：头像/封面/日志配图一律 fileID（模型文本字段 4000 字节上限，禁止 base64 入库）。 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const wx: any;

const EXT_BY_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** 上传本地临时文件，返回 fileID。 */
export async function uploadImage(filePath: string, kind: 'avatar' | 'cover' | 'journal'): Promise<string> {
  const cloudPath = `uploads/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const res = await wx.cloud.uploadFile({ cloudPath, filePath });
  return res.fileID as string;
}

/** fileID → 临时访问链接（有效期由平台决定，页面每次渲染前换链）。 */
export async function tempUrls(fileIds: string[]): Promise<Record<string, string>> {
  const ids = fileIds.filter(Boolean);
  if (!ids.length) return {};
  const res = await wx.cloud.getTempFileURL({ fileList: ids });
  const out: Record<string, string> = {};
  for (const f of res.fileList || []) if (f.fileID && f.tempFileURL) out[f.fileID] = f.tempFileURL;
  return out;
}

export function extFromMime(mime: string): string {
  return EXT_BY_MIME[mime] || 'jpg';
}

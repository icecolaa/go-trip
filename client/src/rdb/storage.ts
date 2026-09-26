/** 云存储封装（Web）：日志配图/封面/头像一律 fileID。
 * js-sdk v3 uploadFile 的 filePath 接 File/Blob；getTempFileURL 换临时访问链。 */
import { cbApp } from './client';

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function uploadImage(file: File, kind: 'avatar' | 'cover' | 'journal'): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const cloudPath = `uploads/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const res = await cbApp().uploadFile({ cloudPath, filePath: file });
  return res.fileID as string;
}

export async function tempUrls(fileIds: string[]): Promise<Record<string, string>> {
  const ids = fileIds.filter(Boolean);
  if (!ids.length) return {};
  const res = await cbApp().getTempFileURL({ fileList: ids });
  const out: Record<string, string> = {};
  for (const f of res.fileList || []) if (f.fileID && f.tempFileURL) out[f.fileID] = f.tempFileURL;
  return out;
}

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomToken } from './util.ts';

/** 数据根目录：与数据库同盘（PocketBay 为 /data 持久卷），上传文件随数据卷保留 */
export function dataRoot(): string {
  if (process.env.POCKETBAY_DATA_DIR) return process.env.POCKETBAY_DATA_DIR;
  return path.resolve('data');
}

export function uploadsDir(): string {
  const dir = path.join(dataRoot(), 'uploads');
  mkdirSync(dir, { recursive: true });
  return dir;
}

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/** 保存 dataURL 图片（前端 canvas 已压缩），返回可访问的 /uploads/ 路径 */
export function saveDataUrlImage(dataUrl: string): string {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!match) throw new Error('仅支持 jpg/png/webp 图片');
  const [, mime, base64] = match;
  const buf = Buffer.from(base64, 'base64');
  if (!buf.length) throw new Error('图片内容为空');
  if (buf.length > MAX_BYTES) throw new Error('图片过大（上限 8MB），请压缩后重试');
  const ext = mime === 'image/jpeg' ? '.jpg' : mime === 'image/png' ? '.png' : '.webp';
  const name = `${Date.now().toString(36)}-${randomToken(8)}${ext}`;
  const dir = uploadsDir();
  writeFileSync(path.join(dir, name), buf, { mode: 0o644 });
  return `/uploads/${name}`;
}

/** 供静态服务使用的文件读取（防路径穿越） */
export function readUpload(relName: string): { buf: Buffer; contentType: string } | null {
  const safe = path.basename(relName);
  if (!safe || safe.startsWith('.')) return null;
  try {
    const buf = readFileSync(path.join(uploadsDir(), safe));
    const ext = path.extname(safe);
    const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return { buf, contentType };
  } catch {
    return null;
  }
}

"use strict";
/** 云存储封装：头像/封面/日志配图一律 fileID（模型文本字段 4000 字节上限，禁止 base64 入库）。 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadImage = uploadImage;
exports.tempUrls = tempUrls;
exports.extFromMime = extFromMime;
const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
/** 上传本地临时文件，返回 fileID。 */
async function uploadImage(filePath, kind) {
    const cloudPath = `uploads/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const res = await wx.cloud.uploadFile({ cloudPath, filePath });
    return res.fileID;
}
/** fileID → 临时访问链接（有效期由平台决定，页面每次渲染前换链）。 */
async function tempUrls(fileIds) {
    const ids = fileIds.filter(Boolean);
    if (!ids.length)
        return {};
    const res = await wx.cloud.getTempFileURL({ fileList: ids });
    const out = {};
    for (const f of res.fileList || [])
        if (f.fileID && f.tempFileURL)
            out[f.fileID] = f.tempFileURL;
    return out;
}
function extFromMime(mime) {
    return EXT_BY_MIME[mime] || 'jpg';
}

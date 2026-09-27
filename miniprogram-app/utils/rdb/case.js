"use strict";
/** 模型字段 snake_case ↔ 客户端 camelCase 深转换。
 * 系统字段（_id/_openid/createdAt/updatedAt）保持原名不转换。 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCamel = toCamel;
exports.toSnake = toSnake;
const SYS = new Set(['_id', '_openid', 'createdAt', 'updatedAt', 'owner', 'createBy', 'updateBy']);
const toCamelKey = (k) => SYS.has(k) ? k : k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const toSnakeKey = (k) => SYS.has(k) ? k : k.replace(/([A-Z])/g, (_, c) => '_' + c.toLowerCase());
/* eslint-disable @typescript-eslint/no-explicit-any */
function toCamel(input) {
    if (Array.isArray(input))
        return input.map(toCamel);
    if (input && typeof input === 'object' && !(input instanceof Date)) {
        const out = {};
        for (const [k, v] of Object.entries(input))
            out[toCamelKey(k)] = toCamel(v);
        return out;
    }
    return input;
}
function toSnake(input) {
    if (Array.isArray(input))
        return input.map(toSnake);
    if (input && typeof input === 'object' && !(input instanceof Date)) {
        const out = {};
        for (const [k, v] of Object.entries(input))
            out[toSnakeKey(k)] = toSnake(v);
        return out;
    }
    return input;
}

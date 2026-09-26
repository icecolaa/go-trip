/** 模型字段 snake_case ↔ 客户端 camelCase 深转换。
 * 系统字段（_id/_openid/createdAt/updatedAt）保持原名不转换。 */

const SYS = new Set(['_id', '_openid', 'createdAt', 'updatedAt', 'owner', 'createBy', 'updateBy']);

const toCamelKey = (k: string): string =>
  SYS.has(k) ? k : k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

const toSnakeKey = (k: string): string =>
  SYS.has(k) ? k : k.replace(/([A-Z])/g, (_, c: string) => '_' + c.toLowerCase());

/* eslint-disable @typescript-eslint/no-explicit-any */
export function toCamel<T = any>(input: any): T {
  if (Array.isArray(input)) return input.map(toCamel) as any;
  if (input && typeof input === 'object' && !(input instanceof Date)) {
    const out: any = {};
    for (const [k, v] of Object.entries(input)) out[toCamelKey(k)] = toCamel(v);
    return out;
  }
  return input;
}

export function toSnake<T = any>(input: any): T {
  if (Array.isArray(input)) return input.map(toSnake) as any;
  if (input && typeof input === 'object' && !(input instanceof Date)) {
    const out: any = {};
    for (const [k, v] of Object.entries(input)) out[toSnakeKey(k)] = toSnake(v);
    return out;
  }
  return input;
}

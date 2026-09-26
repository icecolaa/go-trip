/** 数据模型通用行操作（全部返回 camelCase 视图；写入口接受 camelCase）。
 * 权限由模型层强制：list/get 只见自己的行（_openid 隔离），无需显式 where 自己。 */
import { model } from './client';
import { toCamel, toSnake } from './case';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;

const MASTER = { $master: true };

/** 平台 list 缺省每页只回 10 条（不传 pageSize 时），必须显式给大页。
 * 100 覆盖本项目所有单表读取（活动/清单 ≤80、feed 60）；超出时上层自行分页。 */
const PAGE_SIZE = 100;

/** SDK 返回不对称（实测）：create 回 {id}，list/get 的行只有 _id 没有 id。
 * 读路径统一补 id 字段，全链（卡片跳转/分组/编辑/删除定位）才拿得到行 id。 */
function withId(row: Row): Row {
  if (row && row.id == null && row._id != null) return { ...row, id: row._id };
  return row;
}

/** 按条件列行；orderBy 形如 [{ created_at: 'desc' }]（模型字段名）。 */
export async function listRows(name: string, where: Row = {}, orderBy?: Row[], pageSize?: number): Promise<Row[]> {
  const res = await model(name).list({
    filter: { where },
    select: MASTER,
    pageSize: pageSize || PAGE_SIZE,
    ...(orderBy ? { orderBy } : {}),
  });
  return toCamel(res?.data?.records || []).map(withId);
}

export async function getRowById(name: string, id: string): Promise<Row | null> {
  const res = await model(name).get({ filter: { where: { _id: { $eq: id } } } });
  const rec = res?.data;
  // 平台 get 未命中回 {}（不是 null），以 _id 存在与否判定真找到
  return rec && rec._id ? withId(toCamel(rec)) : null;
}

export async function createRow(name: string, data: Row): Promise<Row> {
  const res = await model(name).create({ data: toSnake(data) });
  // create 只回 id；读回完整行太贵，直接拼返回（调用方需要系统字段时自行 getRowById）
  return { id: res?.data?.id ?? res?.data?._id, ...toCamel(data) };
}

/** 批量建行，返回按传入顺序对应的 _id 列表。
 *  ⚠️ 调用方需要新行 id 时必须用返回值——「写后立即 list」在平台侧有可见性延迟，查不到刚写的行。 */
export async function createRows(name: string, data: Row[]): Promise<string[]> {
  if (!data.length) return [];
  const res = await model(name).createMany({ data: toSnake(data) });
  return (res?.data?.idList || []) as string[];
}

export async function updateRow(name: string, id: string, data: Row): Promise<void> {
  await model(name).update({ data: toSnake(data), filter: { where: { _id: { $eq: id } } } });
}

export async function deleteRow(name: string, id: string): Promise<void> {
  await model(name).delete({ filter: { where: { _id: { $eq: id } } } });
}

/** 按条件批量删（如删某行程全部活动）。 */
export async function deleteRows(name: string, where: Row): Promise<void> {
  await model(name).deleteMany({ filter: { where } });
}

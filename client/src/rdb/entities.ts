/** 数据模型通用行操作（全部返回 camelCase 视图；写入口接受 camelCase）。
 * PocketBay 全栈部署：底层走同源 /api/data 通用 CRUD（server 端 user_id 行级隔离）。
 * 平台怪癖备注（CloudBase models 时代实测，迁移后语义保持一致）：
 * - list 缺省每页 10 条 → 传大 pageSize；create 回 {id} 而 list/get 行只有 _id → withId 归一。 */
import { api } from '../api'
import { toCamel, toSnake } from './case'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>

/** 单表读取上限（活动/清单 ≤80、feed 60）；超出时上层自行分页。 */
const PAGE_SIZE = 100

/** SDK 返回不对称（历史实测）：create 回 {id}，list/get 的行只有 _id 没有 id。
 * 读路径统一补 id 字段，全链（卡片跳转/分组/编辑定位/删除定位）才拿得到行 id。 */
function withId(row: Row): Row {
  if (row && row.id == null && row._id != null) return { ...row, id: row._id }
  return row
}

/** 按条件列行；orderBy 形如 [{ created_at: 'desc' }]（模型字段名）。 */
export async function listRows(name: string, where: Row = {}, orderBy?: Row[], pageSize?: number): Promise<Row[]> {
  const qs = new URLSearchParams({ pageSize: String(pageSize || PAGE_SIZE) })
  if (Object.keys(where).length) qs.set('where', JSON.stringify(toSnake(where)))
  if (orderBy?.length) qs.set('orderBy', JSON.stringify(orderBy))
  const res = await api.get<{ records: Row[] }>(`/api/data/${name}?${qs}`)
  return toCamel(res?.records || []).map(withId)
}

export async function getRowById(name: string, id: string): Promise<Row | null> {
  const rec = await api.get<Row>(`/api/data/${name}/${encodeURIComponent(id)}`)
  // 未命中回 {}（与旧平台语义一致），以 _id 存在与否判定真找到
  return rec && rec._id ? withId(toCamel(rec)) : null
}

export async function createRow(name: string, data: Row): Promise<Row> {
  const res = await api.post<{ id: string }>(`/api/data/${name}`, { data: toSnake(data) })
  // 只回 id；读回完整行太贵，直接拼返回（调用方需要系统字段时自行 getRowById）
  return { id: res?.id, ...toCamel(data) }
}

/** 批量建行，返回按传入顺序对应的 id 列表。 */
export async function createRows(name: string, data: Row[]): Promise<string[]> {
  if (!data.length) return []
  const res = await api.post<{ idList: string[] }>(`/api/data/${name}/bulk`, { rows: data.map(d => toSnake(d)) })
  return (res?.idList || []) as string[]
}

export async function updateRow(name: string, id: string, data: Row): Promise<void> {
  await api.patch(`/api/data/${name}/${encodeURIComponent(id)}`, { data: toSnake(data) })
}

export async function deleteRow(name: string, id: string): Promise<void> {
  await api.del(`/api/data/${name}/${encodeURIComponent(id)}`)
}

/** 按条件批量删（如删某行程全部活动）。 */
export async function deleteRows(name: string, where: Row): Promise<void> {
  await api.post(`/api/data/${name}/delete-many`, { where: toSnake(where) })
}

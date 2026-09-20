/**
 * 隐私脱敏：证件号 / 订单号 / 房间号这类数字在页面上只显示掩码。
 * 只处理「明确带标识词的数字」和「18 位身份证」，不做模糊猜测，避免误伤正常内容
 *（如价格 1200、日期 2026-10-01、年份）。
 */

const ID_CARD = /\b\d{17}[\dXx]\b/g;
const ORDER_NO = /(订单号|订单编号|订单|确认号|预订号|PNR|票号)\s*[:：]?\s*([A-Za-z0-9-]{4,})/g;
const ROOM_NO = /(房间号|房号|房间)\s*[:：]?\s*([A-Za-z0-9-]{1,8})/g;

function mask(s: string): string {
  if (s.length <= 2) return '**';
  if (s.length <= 4) return `${s.slice(0, 1)}${'*'.repeat(s.length - 1)}`;
  return `${s.slice(0, 2)}${'*'.repeat(Math.min(6, s.length - 4))}${s.slice(-2)}`;
}

export function maskSensitive(text: string): string {
  return String(text || '')
    .replace(ID_CARD, m => mask(m))
    .replace(ORDER_NO, (_full, label, num) => `${label} ${mask(String(num))}`)
    .replace(ROOM_NO, (_full, label, num) => `${label} ${mask(String(num))}`);
}

/** 渲染脱敏后的文本；命中掩码时给出提示，让用户知道这里原本有敏感信息 */
export default function SensitiveText({ text }: { text: string }) {
  const raw = String(text || '');
  const masked = maskSensitive(raw);
  if (masked === raw) return <>{raw}</>;
  return <span title="证件号 / 订单号 / 房间号已按隐私要求隐藏">{masked}</span>;
}

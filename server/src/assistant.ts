import { chat, aiConfigured } from './ai.ts';

/* ============================================================
 * 使用助手：解答 GoTrip 功能使用问题的内置问答助手
 * AI 可用时由大模型回答；未配置时返回内置指南（保证功能永远可用）
 * ============================================================ */

const ASSISTANT_SYSTEM = `你是"出发吧 GoTrip"的使用助手，帮助用户上手这个协作旅行规划应用。
要求：用简体中文回答；友好简洁，一般不超过 150 字；只回答与 GoTrip 使用相关的问题，无关问题礼貌引导回应用功能；一次只回答用户最后一条消息。

【GoTrip 功能速览】
1. 旅程与协作：仪表盘「＋创建旅程」；成员页用邀请码或对方旅行 ID 加人；角色分发起人/管理员/成员/观察者（发起人可在成员页转让）。
2. 行程：行程页按天添加/修改/删除活动，可拖拽排序；「✨ AI 助手」按目的地+天数+节奏+偏好生成行程，或在"解析攻略文本"里粘贴攻略自动转成行程；「🧭 出发模式」是全屏当天视图：勾选完成、看手绘路线图、一键高德导航、复制今日路线。
3. 地图：高德地图展示所有定位点，可按天筛选；搜索地点（高德 POI）可直接加入某天行程。
4. 预算：预算页「＋记一笔」选垫付人和分摊方式，自动生成分类统计与"转账最少"结算方案。
5. 清单：打包物品按分类勾选，可指派负责人，「从模板导入」一键生成常用清单。
6. 锦囊：按目的地生成美食/贴士/语言/拍摄四类卡片，也可「自定义卡片」记录团队约定。
7. 日志与动态：日志页发旅行手记（谁写谁改），动态页看所有成员操作记录。
8. 分享：成员页可开启只读分享链接、创建邀请码（可限制次数与有效期）。
9. 其他：顶栏 🌙 切换夜间模式；旅程头部显示预算消耗与在线成员。

【常见问题】
- 忘记密码：暂不支持自助找回，可重新注册（数据不互通）。
- 删除旅程：旅程列表进入后，发起人在成员页可解散。
- AI 慢或没反应：生成一次约 20-40 秒，请耐心等待；未配置大模型时自动用内置规则。`;

/** 未配置 AI 时的内置指南兜底 */
const FALLBACK_GUIDE = `当前未启用 AI 助手，这里是常用功能速查：
· 邀请成员：旅程内「成员」页 → 创建邀请码发给朋友，或输入对方旅行 ID 直接添加；
· 规划行程：「行程」页按天添加活动，或用「✨ AI 助手」按目的地一键生成；
· 出发当天：点「🧭 出发模式」，逐站打勾、看路线、一键高德导航；
· 记账分摊：「预算」页「＋记一笔」，结束后自动生成结算方案；
· 打包清单：「清单」页可从模板一键导入；
· 使用技巧：「锦囊」页有目的地美食/贴士/拍摄建议。`;

interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** 规整并截断历史（最多 10 轮，单条 500 字） */
export function sanitizeHistory(raw: any): HistoryTurn[] {
  return (Array.isArray(raw) ? raw : [])
    .map((m: any) => ({
      role: m?.role === 'assistant' ? 'assistant' : 'user',
      content: String(m?.content || '').trim().slice(0, 500),
    }))
    .filter((m: HistoryTurn) => m.content)
    .slice(-10);
}

/** 回答使用问题：AI 优先，失败回退内置指南。永远返回非空文本 */
export async function answerUsageQuestion(history: HistoryTurn[]): Promise<{ reply: string; source: 'ai' | 'fallback' }> {
  if (aiConfigured() && history.length) {
    // 把多轮历史压平成一段转写，让模型回答最后一条用户消息
    const transcript = history
      .map(m => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
      .join('\n');
    const prompt = `以下是用户与你的对话历史（最后一条是最新问题）：\n${transcript}\n\n请回答最后的用户消息。`;
    // 纯文本对话，关闭 JSON 模式（json_object 会把回答包进 {"answer": ...}）
    const out = await chat(ASSISTANT_SYSTEM, prompt, 60000, false);
    if (out) {
      const reply = out.trim().slice(0, 1500);
      if (reply) return { reply, source: 'ai' };
    }
  }
  return { reply: FALLBACK_GUIDE, source: 'fallback' };
}

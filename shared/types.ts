/** GoTrip 前后端共享类型定义 */

export type MemberRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface PublicUser {
  id: number;
  travelId: number;
  username: string;
  nickname: string;
  avatarColor: string;
  bio?: string;
  /** 头像图片（压缩后的 dataURL），微信静默注册用户在个人资料页设置 */
  avatarUrl?: string;
}

export interface Me extends PublicUser {
  createdAt: string;
}

export interface Trip {
  id: number;
  ownerId: number;
  title: string;
  destination: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  coverEmoji: string;
  coverColor: string;
  /** 旅程头图：dataURL 或 /uploads/ 路径；为空时前端按目的地生成兜底图 */
  coverImage?: string;
  budget: number; // 总预算（元），0 表示未设置
  visibility: 'private' | 'link';
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 条目确认状态：现场选择/可选等不影响主行程的状态不进入「待确认」 */
export type TripStatus =
  | '已确认' | '已出票' | '已预订' | '仅限现金' | '现场选择' | '现场确认'
  | '可选' | '未预订' | '待确认' | '暂定';

/** 不计入待确认中心的状态（不影响主行程或可现场决定） */
export const NON_PENDING_STATUSES: TripStatus[] = ['现场选择', '可选', '暂定'];

/** 地点：候选景点/餐厅与正式地点同表，靠 candidate 区分；候选永不写入 days/activities */
export type TripPlaceKind = 'attraction' | 'restaurant' | 'hotel' | 'transport' | 'station' | 'airport' | 'meeting' | 'other';

export interface TripPlace {
  id: number;
  tripId: number;
  kind: TripPlaceKind;
  name: string;
  city: string;
  address: string;
  lat: number | null;
  lng: number | null;
  note: string;
  dishes: string; // 餐厅推荐菜，顿号分隔
  status: TripStatus;
  candidate: boolean; // true = 候选/可选，不进入正式行程
  sort: number;
  createdAt: string;
}

/** 现金项：金额、币种、每人或总价、人数、合计；可关联到某天/交通/住宿条目 */
export type CashRefKind = 'day' | 'transport' | 'stay';

export interface TripCashItem {
  id: number;
  tripId: number;
  title: string;
  amount: number;
  currency: string; // CNY / USD / JPY …
  perPerson: boolean; // true = amount 为单人价，total = amount × people
  people: number;
  total: number; // 冗余存储，避免前端口径不一导致重复计算
  dayId: number | null;
  refKind: CashRefKind | null;
  refId: number | null;
  createdAt: string;
}

export interface TripMember {
  id: number;
  tripId: number;
  userId: number | null; // 为空表示尚未绑定的占位成员
  role: MemberRole;
  displayName: string;
  avatarColor: string;
  location: string | null; // 最近上报的位置描述
  locationLat: number | null;
  locationLng: number | null;
  locationAt: string | null;
  joinedAt: string;
  user?: PublicUser | null;
  online?: boolean;
}

export interface Invite {
  id: number;
  tripId: number;
  code: string;
  createdBy: number;
  maxUses: number; // 0 表示不限
  uses: number;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
}

export type ActivityKind = 'sight' | 'food' | 'hotel' | 'transport' | 'shopping' | 'show' | 'other';

export interface TripDay {
  id: number;
  tripId: number;
  dayNumber: number;
  date: string; // YYYY-MM-DD
  title: string;
  place: string; // 当日主要地点（用于天气/路线）
}

export interface Activity {
  id: number;
  dayId: number;
  tripId: number;
  sort: number;
  time: string | null; // HH:mm
  endTime: string | null;
  kind: ActivityKind;
  title: string;
  place: string;
  lat: number | null;
  lng: number | null;
  cost: number; // 预估费用
  notes: string;
  /** 确认状态；为空表示未标注 */
  status?: TripStatus;
  assigneeId: number | null; // 负责人（成员 id）
  createdAt: string;
}

export type ExpenseSplitMode = 'equal' | 'payer';

export interface Expense {
  id: number;
  tripId: number;
  payerMemberId: number; // 支付人（trip_members.id）
  amount: number;
  category: string; // 交通/住宿/餐饮/门票/购物/其他
  title: string;
  date: string;
  splitMode: ExpenseSplitMode;
  participants: number[]; // 参与分摊的 trip_members.id；空数组 = 全体成员
  createdAt: string;
}

export interface Settlement {
  fromMemberId: number;
  toMemberId: number;
  amount: number;
}

export interface BudgetSummary {
  total: number;
  byCategory: { category: string; amount: number }[];
  perMember: { memberId: number; paid: number; share: number; balance: number }[];
  settlements: Settlement[];
}

export type PackingCategory = '证件' | '衣物' | '电子' | '洗护' | '药品' | '其他';

export interface PackingItem {
  id: number;
  tripId: number;
  category: PackingCategory | string;
  title: string;
  done: boolean;
  assigneeMemberId: number | null;
  quantity: number;
  note: string;
  createdAt: string;
}

export interface JournalImage { full: string; thumb: string }

export interface JournalNote {
  id: number;
  tripId: number;
  dayId: number | null;
  authorMemberId: number;
  content: string;
  mood: string; // emoji
  images: JournalImage[];
  createdAt: string;
  updatedAt: string;
  author?: { nickname: string; avatarColor: string } | null;
}

export type LinkType = 'xhs' | 'gzh' | 'web';

export interface TravelLink {
  id: number;
  tripId: number;
  type: LinkType;
  title: string;
  url: string;
  note: string;
  createdAt: string;
}

export interface ActivityLogEntry {
  id: number;
  tripId: number;
  memberName: string;
  avatarColor: string;
  action: string; // 动作描述文案
  detail: string;
  createdAt: string;
}

export interface WeatherDay {
  date: string;
  place: string;
  weatherCode: number;
  label: string;
  icon: string;
  tempMax: number | null;
  tempMin: number | null;
}

export interface TripBundle {
  trip: Trip;
  myRole: MemberRole;
  myMemberId: number;
  members: TripMember[];
  invites: Invite[];
  days: TripDay[];
  activities: Activity[];
  expenses: Expense[];
  budget: BudgetSummary;
  packing: PackingItem[];
  journal: JournalNote[];
  feed: ActivityLogEntry[];
  weather: WeatherDay[];
  places: TripPlace[];
  cash: TripCashItem[];
  onlineMemberIds: number[];
}

/** AI 相关 */
export interface ParsedGuide {
  days: {
    dayNumber: number;
    date?: string;
    title: string;
    place: string;
    activities: { time?: string; title: string; kind?: ActivityKind; place?: string; notes?: string }[];
  }[];
  source: 'ai' | 'builtin';
}

export interface GeneratePlanReq {
  city: string;
  days: number;
  pace?: '轻松' | '适中' | '充实';
  interests?: string[]; // 美食 / 自然 / 人文 / 亲子 / 购物 / 夜生活
}

/** 实时消息 */
export type WsClientMessage =
  | { type: 'subscribe'; tripId: number }
  | { type: 'unsubscribe'; tripId: number }
  | { type: 'heartbeat' }
  | { type: 'location'; tripId: number; lat: number; lng: number; city: string };

export type WsServerMessage =
  | { type: 'hello'; userId: number }
  | { type: 'presence'; tripId: number; onlineMemberIds: number[] }
  | { type: 'change'; tripId: number; entity: string; action: string; byMemberId: number }
  | { type: 'location'; tripId: number; memberId: number; lat: number; lng: number; city: string; at: string };

export interface Poi {
  name: string;
  city: string;
  lat: number;
  lng: number;
  kind: string; // 景点/美食/...
  desc?: string;
  source: 'builtin' | 'amap';
}

/* ======== 旅行锦囊（参考 personalized-travel-guide 手册模块） ======== */
export type GuideCategory = 'food' | 'tip' | 'phrase' | 'photo';

export interface GuideItem {
  label?: string; // 短标签，如短语原文 / 菜名 / 时间边界
  text: string;
}

export interface GuideCard {
  id: number;
  tripId: number;
  category: GuideCategory;
  icon: string;
  title: string;
  summary: string;
  items: GuideItem[];
  source: 'builtin' | 'ai' | 'custom';
  sort: number;
}

/** rdb 直连架构的小程序类型（与数据模型 gt_* 对应，id = _id 字符串）。
 * 注意：不再从 @shared/types 重导出——shared/types 仍服务旧 Web 版，阶段二再合并。 */

export type MemberRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface Profile {
  id: string
  /** 平台自动维护的属主标识（weda_<openid>），列表查询的稳定锚点 */
  owner?: string
  nickname: string
  avatarColor: string
  bio: string
  avatarUrl: string | null // 云存储 fileID
  createdAt?: number
}

/** 占位成员（无账号同伴）：分账/指派用 */
export interface TripMember {
  id: string
  tripId: string
  role: MemberRole
  displayName: string
  avatarColor: string
  location: string | null
  locationLat: number | null
  locationLng: number | null
  locationAt: string | null
  createdAt?: number
}

export interface Trip {
  id: string

  title: string
  destination: string
  description: string
  startDate: string
  endDate: string
  coverEmoji: string
  coverColor: string
  coverImage: string | null // 云存储 fileID
  budget: number
  visibility: 'private' | 'link'
  /** 平台属主标识 weda_<openid>（业务挪用：列表查询锚点，见 rdb/trip.ts listTrips 注释） */
  shareToken: string | null
  createdAt?: number
  updatedAt?: number
}

export interface TripDay {
  id: string
  tripId: string
  dayNumber: number
  date: string
  title: string
  place: string
}

export type ActivityKind = 'sight' | 'food' | 'hotel' | 'transport' | 'shopping' | 'show' | 'other';

export interface Activity {
  id: string
  tripId: string
  dayId: string
  sort: number
  time: string | null
  endTime: string | null
  kind: ActivityKind
  title: string
  place: string
  lat: number | null
  lng: number | null
  cost: number
  notes: string
  status: string | null
  assigneeMemberId: string | null
  createdAt?: number
}

export interface Expense {
  id: string
  tripId: string
  payerMemberId: string
  amount: number
  category: string
  title: string
  date: string
  splitMode: 'equal' | 'payer'
  participants: string[] // 成员 _id 列表（库里 JSON 字符串，rdb 层已转）
  createdAt?: number
}

export interface PackingItem {
  id: string
  tripId: string
  category: string
  title: string
  done: boolean
  assigneeMemberId: string | null
  quantity: number
  note: string
  createdAt?: number
}

export interface JournalImage {
  full: string  // 云存储 fileID
  thumb: string // 云存储 fileID
}

export interface JournalNote {
  id: string
  tripId: string
  dayId: string | null
  authorMemberId: string
  content: string
  mood: string
  images: JournalImage[]
  createdAt?: number
  updatedAt?: number
}

export interface GuideItem {
  label?: string
  text: string
}

export interface GuideCard {
  id: string
  tripId: string
  category: 'tip' | 'food' | 'phrase' | 'photo'
  icon: string
  title: string
  summary: string
  items: GuideItem[]
  source: 'builtin' | 'ai' | 'custom'
  sort: number
  createdAt?: number
}

export interface TravelLink {
  id: string
  tripId: string
  type: 'web' | 'xhs' | 'gzh'
  title: string
  url: string
  note: string
  createdAt?: number
}

export interface TripPlace {
  id: string
  tripId: string
  kind: string
  name: string
  city: string
  address: string
  lat: number | null
  lng: number | null
  note: string
  dishes: string
  status: string
  candidate: boolean
  sort: number
  createdAt?: number
}

export interface TripCashItem {
  id: string
  tripId: string
  title: string
  amount: number
  currency: string
  perPerson: boolean
  people: number
  total: number
  dayId: string | null
  refKind: 'day' | 'transport' | 'stay' | null
  refId: string | null
  createdAt?: number
}

export interface ActivityLogEntry {
  id: string
  tripId: string
  memberName: string
  avatarColor: string
  action: string
  detail: string
  createdAt?: number
}

export interface BudgetSummary {
  total: number
  byCategory: { category: string; amount: number }[]
  perMember: { memberId: string; paid: number; share: number; balance: number }[]
  settlements: { fromMemberId: string; toMemberId: string; amount: number }[]
}

export interface WeatherDay {
  date: string
  tempMax: number | null
  tempMin: number | null
  code: number | null
  description: string
}

export interface Poi {
  name: string
  location: string
  address: string
  city: string
  lat: number | null
  lng: number | null
}

export interface ParsedActivity {
  time: string | null
  endTime: string | null
  kind: ActivityKind
  title: string
  place: string
  notes: string
  cost: number | null
}

export interface ParsedDay {
  dayNumber: number
  title?: string
  date?: string | null
  activities: ParsedActivity[]
}

export interface ParsedGuide {
  days: ParsedDay[]
  source?: string
}

export interface GeneratePlanReq {
  city: string
  days: number
  pace: string
  interests: string
}

/** 行程聚合读模型（对照旧 /api/trips/:id 的 TripBundle） */
export interface TripBundle {
  trip: Trip
  members: TripMember[]
  days: TripDay[]
  activities: Activity[]
  expenses: Expense[]
  budget: BudgetSummary
  packing: PackingItem[]
  journal: JournalNote[]
  feed: ActivityLogEntry[]
  places: TripPlace[]
  cash: TripCashItem[]
  links: TravelLink[]
  guideCards: GuideCard[]
}

export interface TripCardInfo {
  id: string
  title: string
  destination: string
  description: string
  startDate: string
  endDate: string
  coverEmoji: string
  coverColor: string
  coverImage?: string
  budget: number
  // listTrips 已裁剪（首屏提速，2026-09-28）：不再输出，保留可选仅为旧调用方兼容
  memberPreview?: { displayName: string; avatarColor: string }[]
  totalSpent?: number
  activityCount: number
}

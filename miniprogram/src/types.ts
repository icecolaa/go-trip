import type { PublicUser, MemberRole, TripDay, Activity, Expense, PackingItem, TripMember } from '@shared/types'

export type { TripBundle, PublicUser, Poi, ParsedGuide, WeatherDay, MemberRole, TripDay, Activity, Expense, PackingItem, TripMember } from '@shared/types'

/** 与 client/src/api.ts 的 TripCardInfo 保持一致 */
export interface TripCardInfo {
  id: number
  title: string
  destination: string
  description: string
  startDate: string
  endDate: string
  coverEmoji: string
  coverColor: string
  budget: number
  myRole: MemberRole
  memberPreview: { displayName: string; avatarColor: string; userId: number | null }[]
  totalSpent: number
  activityCount: number
}

export interface Me extends PublicUser {}

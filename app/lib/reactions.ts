export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const

export type QuickReaction = (typeof QUICK_REACTIONS)[number]

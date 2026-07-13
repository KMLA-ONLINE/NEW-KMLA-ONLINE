/**
 * One row of `public.reaction_types`. `icon` is nullable there, so a renderer
 * that wants a glyph has to fall back to the name.
 */
export type ReactionType = {
  id: number
  key: string
  name: string
  icon: string | null
}

/**
 * Stand-in until a loader reads `public.reaction_types`.
 *
 * The database currently seeds only two rows -- 'like' and 'love' -- and gives
 * neither an icon, so four of these six exist nowhere but here. Keep this in a
 * route or a data module, never in a component: the whole point of passing
 * reaction types down as props is that the day the seed catches up, only the
 * data source changes.
 */
export const PLACEHOLDER_REACTION_TYPES: ReactionType[] = [
  { id: 1, key: "like", name: "좋아요", icon: "👍" },
  { id: 2, key: "love", name: "하트", icon: "❤️" },
  { id: 3, key: "haha", name: "웃겨요", icon: "😆" },
  { id: 4, key: "wow", name: "놀라워요", icon: "😮" },
  { id: 5, key: "sad", name: "슬퍼요", icon: "😢" },
  { id: 6, key: "pray", name: "화나요", icon: "😡" },
]

export function getReactionGlyph(reactionType: ReactionType) {
  return reactionType.icon ?? reactionType.name
}

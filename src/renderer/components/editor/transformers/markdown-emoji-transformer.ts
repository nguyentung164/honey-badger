import { TextMatchTransformer } from "@lexical/markdown"
import { $createTextNode } from "lexical"

import emojiList from '@/components/editor/utils/emoji-list'

export const EMOJI: TextMatchTransformer = {
  dependencies: [],
  export: () => null,
  importRegExp: /:([a-z0-9_]+):/,
  regExp: /:([a-z0-9_]+):/,
  replace: (textNode, [, name]) => {
    const emoji = emojiList.find((entry: { aliases: string[] }) =>
      entry.aliases.includes(name),
    )?.emoji
    if (emoji) {
      textNode.replace($createTextNode(emoji))
    }
  },
  trigger: ":",
  type: "text-match",
}

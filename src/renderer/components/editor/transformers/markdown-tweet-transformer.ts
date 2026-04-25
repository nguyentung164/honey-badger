import { ElementTransformer } from "@lexical/markdown"

import {
  $createTweetNode,
  $isTweetNode,
  TweetNode,
} from '@/components/editor/nodes/embeds/tweet-node'

export const TWEET: ElementTransformer = {
  dependencies: [TweetNode],
  export: node => {
    if (!$isTweetNode(node)) {
      return null
    }
    const tweet = node as TweetNode
    return `<tweet id="${tweet.getId()}" />`
  },
  regExp: /<tweet id="([^"]+?)"\s?\/>\s?$/,
  replace: (textNode, _1, match) => {
    const [, id] = match
    const tweetNode = $createTweetNode(id)
    textNode.replace(tweetNode)
  },
  type: "element",
}

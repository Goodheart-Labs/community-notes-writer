import type { Post } from "../api/fetchEligiblePosts";

export function getOriginalTweetContent(post: Post): { 
  text: string; 
  media: string[]; 
  isRetweet: boolean;
  retweetContext?: string;
} {
  // Check if this post has a referenced tweet of type 'retweeted'
  const retweetRef = post.referenced_tweets?.find(rt => rt.type === 'retweeted');
  // Check if this post has a referenced tweet of type 'quoted'  
  const quotedRef = post.referenced_tweets?.find(rt => rt.type === 'quoted');
  
  if (retweetRef && post.referenced_tweet_data) {
    // This is a retweet, return the original tweet content
    return {
      text: post.referenced_tweet_data.text,
      media: post.referenced_tweet_data.media?.map(m => m.url || m.preview_image_url).filter(Boolean) || [],
      isRetweet: true,
      retweetContext: `This community note is about a post that was retweeted. The original tweet content is: "${post.referenced_tweet_data.text}"`
    };
  }
  
  if (quotedRef && post.referenced_tweet_data) {
    // This is a quoted tweet, combine both the quote and the original content
    const combinedText = `${post.text}\n\nQuoted tweet: "${post.referenced_tweet_data.text}"`;
    return {
      text: combinedText,
      media: [
        ...post.media?.map(m => m.url || m.preview_image_url).filter(Boolean) || [],
        ...post.referenced_tweet_data.media?.map(m => m.url || m.preview_image_url).filter(Boolean) || []
      ],
      isRetweet: false, // This is not a retweet, it's a quote tweet
      retweetContext: `This community note is about a quoted tweet. The user's comment is: "${post.text}" and they are quoting: "${post.referenced_tweet_data.text}"`
    };
  }
  
  // Check if this looks like a traditional retweet (RT @username: ...)
  if (post.text.startsWith('RT @')) {
    const rtMatch = post.text.match(/^RT @\w+: (.+)$/);
    if (rtMatch && rtMatch[1]) {
      const originalText = rtMatch[1];
      return {
        text: originalText, // Extract the original tweet text after "RT @username: "
        media: post.media?.map(m => m.url || m.preview_image_url).filter(Boolean) || [],
        isRetweet: true,
        retweetContext: `This community note is about a post that was retweeted. The original tweet content is: "${originalText}"`
      };
    }
  }
  
  // Not a retweet, return the original content
  return {
    text: post.text,
    media: post.media?.map(m => m.url || m.preview_image_url).filter(Boolean) || [],
    isRetweet: false
  };
}
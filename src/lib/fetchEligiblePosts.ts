import axios from "axios";
import { getBearerAuthHeader } from "./authHelpers";

export type Post = {
  id: string;
  author_id: string;
  created_at: string;
  text: string;
  media: any[];
};

const PostSchema = {
  id: "string",
  author_id: "string",
  created_at: "string",
  text: "string",
  media: "array",
};

export async function fetchEligiblePosts(
  bearerToken: string,
  maxResults: number = 10
): Promise<Post[]> {
  const url = "https://api.twitter.com/2/notes/search/posts_eligible_for_notes";
  const params = new URLSearchParams({
    max_results: maxResults.toString(),
    "tweet.fields": "created_at,author_id",
    "media.fields":
      "type,url,preview_image_url,height,width,duration_ms,public_metrics",
    expansions: "attachments.media_keys",
    test_mode: "true",
  });
  const fullUrl = `${url}?${params.toString()}`;

  const response = await axios.get(fullUrl, {
    headers: {
      ...getBearerAuthHeader(bearerToken),
      "Content-Type": "application/json",
    },
  });

  return parsePostsResponse(response.data);
}

function parsePostsResponse(data: any): Post[] {
  const posts: Post[] = [];
  const mediaMap = new Map<string, any>();

  if (data.includes?.media) {
    for (const media of data.includes.media) {
      mediaMap.set(media.media_key, media);
    }
  }

  if (data.data) {
    for (const tweet of data.data) {
      const media = [];
      if (tweet.attachments?.media_keys) {
        for (const mediaKey of tweet.attachments.media_keys) {
          const mediaData = mediaMap.get(mediaKey);
          if (mediaData) {
            media.push({
              media_key: mediaData.media_key,
              type: mediaData.type,
              url: mediaData.url,
              preview_image_url: mediaData.preview_image_url,
              height: mediaData.height,
              width: mediaData.width,
              duration_ms: mediaData.duration_ms,
              view_count: mediaData.public_metrics?.view_count,
            });
          }
        }
      }
      posts.push({
        id: tweet.id,
        author_id: tweet.author_id,
        created_at: tweet.created_at,
        text: tweet.text,
        media,
      });
    }
  }
  return posts;
}

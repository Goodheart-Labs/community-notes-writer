import OAuth from "oauth-1.0a";
import crypto from "crypto";
import axios from "axios";
import { z } from "zod";

// Minimal type definitions
export type Post = {
  id: string;
  author_id: string;
  created_at: string;
  text: string;
  media: any[];
};

export type Config = {
  x_api_key: string;
  x_api_key_secret: string;
  x_access_token: string;
  x_access_token_secret: string;
};

const PostSchema = z.object({
  id: z.string(),
  author_id: z.string(),
  created_at: z.string(),
  text: z.string(),
  media: z.array(z.any()),
});

function getAuthHeader(
  config: Config,
  url: string,
  method: string = "GET",
  data?: any
) {
  const oauth = new OAuth({
    consumer: {
      key: config.x_api_key,
      secret: config.x_api_key_secret,
    },
    signature_method: "HMAC-SHA1",
    hash_function(base_string, key) {
      return crypto
        .createHmac("sha1", key)
        .update(base_string)
        .digest("base64");
    },
  });

  const token = {
    key: config.x_access_token,
    secret: config.x_access_token_secret,
  };

  const requestData = {
    url,
    method,
    data,
  };

  return oauth.toHeader(oauth.authorize(requestData, token));
}

export async function fetchEligiblePosts(
  config: Config,
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
      ...getAuthHeader(config, fullUrl, "GET"),
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

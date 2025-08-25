import { Tweet } from './types';

export class CacheManager {
  private cacheKey = 'community-notes-elo-cache';
  private cacheExpiryKey = 'community-notes-elo-cache-expiry';
  private cacheHours = 2; // Cache for 2 hours

  saveToCache(tweets: Tweet[], daysBack: number): void {
    try {
      const cacheData = {
        tweets,
        daysBack,
        timestamp: Date.now()
      };
      localStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
      
      // Set expiry time
      const expiryTime = Date.now() + (this.cacheHours * 60 * 60 * 1000);
      localStorage.setItem(this.cacheExpiryKey, expiryTime.toString());
      
      console.log(`Cached ${tweets.length} tweets for ${daysBack} days`);
    } catch (error) {
      console.error('Error saving to cache:', error);
    }
  }

  getFromCache(daysBack: number): Tweet[] | null {
    try {
      const expiryTime = localStorage.getItem(this.cacheExpiryKey);
      if (!expiryTime || Date.now() > parseInt(expiryTime)) {
        console.log('Cache expired');
        this.clearCache();
        return null;
      }

      const cacheDataStr = localStorage.getItem(this.cacheKey);
      if (!cacheDataStr) return null;

      const cacheData = JSON.parse(cacheDataStr);
      
      // Check if the cached data is for the same time period
      if (cacheData.daysBack !== daysBack) {
        console.log(`Cache is for ${cacheData.daysBack} days, but requested ${daysBack} days`);
        return null;
      }

      const ageMinutes = Math.round((Date.now() - cacheData.timestamp) / 1000 / 60);
      console.log(`Using cached data (${ageMinutes} minutes old, ${cacheData.tweets.length} tweets)`);
      
      return cacheData.tweets;
    } catch (error) {
      console.error('Error reading from cache:', error);
      this.clearCache();
      return null;
    }
  }

  clearCache(): void {
    localStorage.removeItem(this.cacheKey);
    localStorage.removeItem(this.cacheExpiryKey);
    console.log('Cache cleared');
  }

  getCacheInfo(): { exists: boolean; ageMinutes: number; tweetCount: number; daysBack: number } | null {
    try {
      const cacheDataStr = localStorage.getItem(this.cacheKey);
      if (!cacheDataStr) return null;

      const cacheData = JSON.parse(cacheDataStr);
      const ageMinutes = Math.round((Date.now() - cacheData.timestamp) / 1000 / 60);
      
      return {
        exists: true,
        ageMinutes,
        tweetCount: cacheData.tweets.length,
        daysBack: cacheData.daysBack
      };
    } catch (error) {
      return null;
    }
  }
}
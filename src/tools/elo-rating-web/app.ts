import { AirtableClient } from './airtableClient';
import { EloCalculator } from './eloCalculator';
import { CacheManager } from './cacheManager';
import { Tweet, ComparisonPair, Comparison } from './types';

class CommunityNotesComparison {
  private airtableClient: AirtableClient | null = null;
  private eloCalculator: EloCalculator;
  private cacheManager: CacheManager;
  private tweets: Tweet[] = [];
  private comparisonPairs: ComparisonPair[] = [];
  private currentPairIndex: number = 0;
  private comparisons: Comparison[] = [];
  private currentComparison: Comparison | null = null;
  private awaitingRating: boolean = false;

  private getElement(id: string) {
    const element = document.getElementById(id);
    if (!element) {
      console.error(`Element with id '${id}' not found`);
    }
    return element;
  }

  constructor() {
    this.eloCalculator = new EloCalculator();
    this.cacheManager = new CacheManager();
    this.initializeEventListeners();
    this.checkForCredentials();
    
    // Auto-fetch data on load if credentials are available
    setTimeout(() => {
      if (this.airtableClient) {
        this.fetchData();
      }
    }, 100);
  }

  private checkForCredentials() {
    // First check for injected credentials from server
    const config = (window as any).AIRTABLE_CONFIG;
    if (config && config.apiKey && config.baseId && config.tableName) {
      this.airtableClient = new AirtableClient(config.apiKey, config.baseId, config.tableName);
      this.showInterface('loadingState');
      return;
    }
    
    // Fallback to URL params (for easy sharing)
    const urlParams = new URLSearchParams(window.location.search);
    const apiKey = urlParams.get('apiKey');
    const baseId = urlParams.get('baseId');
    const tableName = urlParams.get('tableName');

    if (apiKey && baseId && tableName) {
      this.airtableClient = new AirtableClient(apiKey, baseId, tableName);
      this.showInterface('loadingState');
    } else {
      // Show instructions for adding credentials
      this.showCredentialsPrompt();
    }
  }

  private showCredentialsPrompt() {
    const loadingState = this.getElement('loadingState');
    if (!loadingState) return;
    
    loadingState.innerHTML = `
      <div class="max-w-2xl mx-auto">
        <i class="fas fa-key text-4xl text-gray-400 mb-4"></i>
        <h2 class="text-xl font-semibold mb-4">Airtable Credentials Required</h2>
        <p class="text-gray-600 mb-6">Add your Airtable credentials to the URL:</p>
        <div class="text-left bg-gray-100 p-4 rounded-md mb-6">
          <code class="text-sm">
            ?apiKey=YOUR_API_KEY&baseId=YOUR_BASE_ID&tableName=YOUR_TABLE_NAME
          </code>
        </div>
        <p class="text-gray-600 text-sm">
          Or set up a proxy server to keep your API key secure.
        </p>
      </div>
    `;
  }

  private initializeEventListeners() {
    // Fetch data button - hold shift to force refresh
    document.getElementById('fetchData')?.addEventListener('click', (e) => {
      const forceRefresh = e.shiftKey;
      if (forceRefresh) {
        this.cacheManager.clearCache();
      }
      this.fetchData(forceRefresh);
    });

    // Comparison buttons
    document.getElementById('leftBetter')?.addEventListener('click', () => this.handleComparison('left'));
    document.getElementById('rightBetter')?.addEventListener('click', () => this.handleComparison('right'));
    document.getElementById('equal')?.addEventListener('click', () => this.handleComparison('draw'));
    document.getElementById('skip')?.addEventListener('click', () => this.handleComparison('skip'));

    // Export button
    document.getElementById('exportResults')?.addEventListener('click', () => this.exportResults());

    // Rating interface buttons
    document.getElementById('submitRatings')?.addEventListener('click', () => this.submitRatings());
    document.getElementById('skipRatings')?.addEventListener('click', () => this.skipRatings());

    // Sync slider and input for ratings
    const leftSlider = document.getElementById('leftRating') as HTMLInputElement;
    const leftInput = document.getElementById('leftRatingInput') as HTMLInputElement;
    const rightSlider = document.getElementById('rightRating') as HTMLInputElement;
    const rightInput = document.getElementById('rightRatingInput') as HTMLInputElement;

    leftSlider?.addEventListener('input', () => {
      leftInput.value = (parseFloat(leftSlider.value) / 100).toFixed(2);
    });
    leftInput?.addEventListener('input', () => {
      leftSlider.value = (parseFloat(leftInput.value) * 100).toString();
    });
    rightSlider?.addEventListener('input', () => {
      rightInput.value = (parseFloat(rightSlider.value) / 100).toFixed(2);
    });
    rightInput?.addEventListener('input', () => {
      rightSlider.value = (parseFloat(rightInput.value) * 100).toString();
    });

    // Clear cache button
    document.getElementById('clearCache')?.addEventListener('click', () => {
      this.cacheManager.clearCache();
      alert('Cache cleared! Next fetch will load fresh data from Airtable.');
    });

    // Clear cache when date range changes
    document.getElementById('dateRange')?.addEventListener('change', () => {
      this.cacheManager.clearCache();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Don't process shortcuts when rating
      if (this.awaitingRating) return;
      if (!this.comparisonPairs.length || this.currentPairIndex >= this.comparisonPairs.length) return;
      
      switch(e.key.toLowerCase()) {
        case 'a':
        case 'arrowleft':
          this.handleComparison('left');
          break;
        case 'd':
        case 'arrowright':
          this.handleComparison('right');
          break;
        case 's':
        case 'arrowdown':
          this.handleComparison('draw');
          break;
        case ' ':
        case 'arrowup':
          e.preventDefault();
          this.handleComparison('skip');
          break;
      }
    });
  }

  private async fetchData(forceRefresh: boolean = false) {
    if (!this.airtableClient) return;

    const button = document.getElementById('fetchData') as HTMLButtonElement;
    const loadingState = this.getElement('loadingState');
    if (!loadingState) return;
    
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Fetching...';

    // Show progress in loading state
    const showProgress = (message: string) => {
      loadingState.innerHTML = `
        <div class="max-w-2xl mx-auto">
          <i class="fas fa-spinner fa-spin text-4xl text-blue-500 mb-4"></i>
          <h2 class="text-xl font-semibold mb-2">Loading Data</h2>
          <p class="text-gray-600">${message}</p>
        </div>
      `;
    };

    try {
      const daysBack = parseFloat((document.getElementById('dateRange') as HTMLSelectElement).value);
      
      // Check cache first (unless force refresh)
      const cachedTweets = forceRefresh ? null : this.cacheManager.getFromCache(daysBack);
      if (cachedTweets) {
        const cacheInfo = this.cacheManager.getCacheInfo();
        showProgress(`Loading from cache (${cacheInfo?.ageMinutes} minutes old)...`);
        this.tweets = cachedTweets;
        
        // Add a small delay to show the cache message
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        showProgress('Connecting to Airtable...');
        
        // Add progress callback to airtableClient
        this.airtableClient.onProgress = (message: string) => showProgress(message);
        
        this.tweets = await this.airtableClient.fetchRecords(daysBack);
        
        // Save to cache
        this.cacheManager.saveToCache(this.tweets, daysBack);
      }
      
      // Generate all possible comparison pairs
      showProgress('Generating comparison pairs...');
      this.generateComparisonPairs();
      
      // Reset state
      this.currentPairIndex = 0;
      this.comparisons = [];
      this.eloCalculator.reset();
      
      // Update UI
      showProgress('Preparing interface...');
      this.updateProgress();
      this.updateLeaderboard();
      
      if (this.comparisonPairs.length > 0) {
        this.showInterface('comparisonInterface');
        this.displayCurrentComparison();
        const exportButton = this.getElement('exportResults');
        if (exportButton) exportButton.removeAttribute('disabled');
      } else {
        this.showInterface('loadingState');
        const loadingState = this.getElement('loadingState');
        if (!loadingState) return;
        
        loadingState.innerHTML = `
          <i class="fas fa-info-circle text-4xl text-gray-400 mb-4"></i>
          <p class="text-gray-600">No tweets found with multiple branch attempts in the selected time period.</p>
        `;
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      const loadingState = this.getElement('loadingState');
      if (!loadingState) return;
      
      loadingState.innerHTML = `
        <div class="max-w-2xl mx-auto">
          <i class="fas fa-exclamation-triangle text-4xl text-red-500 mb-4"></i>
          <h2 class="text-xl font-semibold mb-4 text-red-600">Error Fetching Data</h2>
          <p class="text-gray-600 mb-4">${this.escapeHtml(errorMessage)}</p>
          <p class="text-gray-500 text-sm">Check the browser console for more details.</p>
        </div>
      `;
      this.showInterface('loadingState');
    } finally {
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>Fetch Data';
    }
  }

  private generateComparisonPairs() {
    this.comparisonPairs = [];
    
    for (const tweet of this.tweets) {
      // Generate all unique pairs of notes for this tweet
      for (let i = 0; i < tweet.notes.length; i++) {
        for (let j = i + 1; j < tweet.notes.length; j++) {
          // Skip if same bot
          if (tweet.notes[i].botName === tweet.notes[j].botName) continue;
          
          // Randomly assign left/right
          if (Math.random() < 0.5) {
            this.comparisonPairs.push({
              tweet,
              leftNote: tweet.notes[i],
              rightNote: tweet.notes[j],
              leftIndex: i,
              rightIndex: j
            });
          } else {
            this.comparisonPairs.push({
              tweet,
              leftNote: tweet.notes[j],
              rightNote: tweet.notes[i],
              leftIndex: j,
              rightIndex: i
            });
          }
        }
      }
    }

    // Shuffle pairs using Fisher-Yates algorithm for better randomization
    for (let i = this.comparisonPairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.comparisonPairs[i], this.comparisonPairs[j]] = [this.comparisonPairs[j], this.comparisonPairs[i]];
    }

    console.log(`Generated ${this.comparisonPairs.length} comparison pairs, shuffled randomly`);
  }

  private displayCurrentComparison() {
    // Check if we have more comparisons to show - updated!
    if (this.currentPairIndex >= this.comparisonPairs.length) {
      this.showInterface('noMoreComparisons');
      return;
    }

    const pair = this.comparisonPairs[this.currentPairIndex];

    // Display tweet
    const tweetContent = this.getElement('tweetContent');
    if (!tweetContent) return;

    const tweetData = this.parseTweetData(pair.tweet.text);

    // Build tweet display - make URLs clickable
    let tweetHtml = `<div class="space-y-3">`;

    // Convert URLs in text to clickable links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    let processedText = this.escapeHtml(tweetData.text);

    // Replace t.co links with clearer text
    processedText = processedText.replace(urlRegex, (url) => {
      if (url.includes('t.co/')) {
        return `<a href="${url}" target="_blank" class="text-blue-500 hover:underline font-medium">
          <svg class="inline w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"></path>
            <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"></path>
          </svg>View linked content</a>`;
      }
      return `<a href="${url}" target="_blank" class="text-blue-500 hover:underline">${url}</a>`;
    });

    tweetHtml += `<p>${processedText}</p>`;
    
    // Only show media if we have actual JSON data with media
    if (tweetData.media && tweetData.media.length > 0) {
      console.log('Rendering media, count:', tweetData.media.length);
      tweetHtml += `<div class="grid grid-cols-2 gap-2">`;
      for (const media of tweetData.media) {
        console.log('Media item:', {
          type: media.type,
          media_url_https: media.media_url_https,
          media_url: media.media_url,
          url: media.url,
          fullObject: media
        });

        // Check multiple possible image indicators
        const isImage = media.type === 'photo' ||
                       media.media_url_https ||
                       media.media_url ||
                       (media.url && (media.url.includes('.jpg') || media.url.includes('.png') || media.url.includes('.jpeg')));

        if (isImage) {
          const imageUrl = media.media_url_https || media.media_url || media.url;
          if (imageUrl) {
            console.log('Adding image with URL:', imageUrl);
            tweetHtml += `<img src="${imageUrl}" alt="Tweet media" class="rounded-lg max-h-48 object-cover w-full cursor-pointer" onclick="window.open('${imageUrl}', '_blank')">`;
          }
        }
      }
      tweetHtml += `</div>`;
    }
    
    if (tweetData.quotedTweet) {
      // Process the quoted tweet text - replace t.co links with clearer text
      let quotedText = this.escapeHtml(tweetData.quotedTweet.text);

      // Replace t.co links with [View Tweet] or keep other URLs as-is
      quotedText = quotedText.replace(urlRegex, (url) => {
        if (url.includes('t.co/')) {
          return `<a href="${url}" target="_blank" class="text-blue-500 hover:underline font-medium">
            <svg class="inline w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"></path>
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"></path>
            </svg>View Tweet</a>`;
        }
        return `<a href="${url}" target="_blank" class="text-blue-500 hover:underline">${url}</a>`;
      });

      tweetHtml += `
        <div class="border-l-4 border-gray-300 bg-gray-50 rounded-lg p-4 mt-3">
          <div class="flex items-center mb-2">
            <svg class="w-4 h-4 text-gray-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"></path>
              <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"></path>
            </svg>
            <span class="text-sm font-semibold text-gray-600">Quoted Tweet</span>
          </div>
          <p class="text-sm text-gray-700 leading-relaxed">${quotedText}</p>
        </div>
      `;
    }
    
    tweetHtml += `</div>`;
    tweetContent.innerHTML = tweetHtml;
    
    // Display URL
    const tweetUrl = this.getElement('tweetUrl');
    if (!tweetUrl) return;

    tweetUrl.innerHTML = `
      <a href="${pair.tweet.url}" target="_blank" class="inline-flex items-center text-blue-500 hover:text-blue-600 font-medium">
        <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"></path>
          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"></path>
        </svg>
        View on Twitter
      </a>`;
    
    // Display notes with clickable links, character count, and existing ratings
    this.displayNoteWithLinks('leftNote', pair.leftNote.text, pair.leftNote.status, pair.leftNote.wouldBePosted, pair.leftNote.wouldNathanPost, pair.leftNote.botName);
    this.displayNoteWithLinks('rightNote', pair.rightNote.text, pair.rightNote.status, pair.rightNote.wouldBePosted, pair.rightNote.wouldNathanPost, pair.rightNote.botName);
    
    // Show notice if both notes already have ratings
    const ratingsNotice = this.getElement('existingRatingsNotice');
    if (ratingsNotice) {
      if (pair.leftNote.wouldNathanPost !== undefined && pair.rightNote.wouldNathanPost !== undefined) {
        ratingsNotice.classList.remove('hidden');
      } else {
        ratingsNotice.classList.add('hidden');
      }
    }

    // Highlight better button if ratings differ significantly from "would be posted" status
    const leftBetterBtn = this.getElement('leftBetter');
    const rightBetterBtn = this.getElement('rightBetter');

    if (leftBetterBtn && rightBetterBtn &&
        pair.leftNote.wouldNathanPost !== undefined &&
        pair.rightNote.wouldNathanPost !== undefined) {

      // Calculate alignment with "would be posted" (1 = would post, 0 = wouldn't post)
      const leftExpected = pair.leftNote.wouldBePosted ? 1 : 0;
      const rightExpected = pair.rightNote.wouldBePosted ? 1 : 0;

      const leftDiff = Math.abs(pair.leftNote.wouldNathanPost - leftExpected);
      const rightDiff = Math.abs(pair.rightNote.wouldNathanPost - rightExpected);

      // Remove any existing highlights
      leftBetterBtn.classList.remove('ring-4', 'ring-green-500');
      rightBetterBtn.classList.remove('ring-4', 'ring-green-500');

      // If difference is more than 0.2, highlight the better aligned one
      if (Math.abs(leftDiff - rightDiff) > 0.2) {
        if (leftDiff < rightDiff) {
          // Left is better aligned
          leftBetterBtn.classList.add('ring-4', 'ring-green-500');
        } else {
          // Right is better aligned
          rightBetterBtn.classList.add('ring-4', 'ring-green-500');
        }
      }
    }
  }

  private parseTweetData(tweetJson: string) {
    try {
      const data = JSON.parse(tweetJson);

      // Debug log to see what we're getting
      console.log('Full tweet data:', data);
      console.log('Tweet data structure:', {
        hasMedia: !!data.media,
        hasExtendedEntities: !!data.extended_entities,
        hasEntities: !!data.entities,
        mediaCount: data.media?.length || 0,
        extendedMediaCount: data.extended_entities?.media?.length || 0,
        entitiesMediaCount: data.entities?.media?.length || 0
      });

      // Handle the actual structure we're getting from our pipeline
      let quotedTweet = null;

      // Check for referenced_tweet_data (our pipeline's format)
      if (data.referenced_tweet_data) {
        quotedTweet = {
          text: data.referenced_tweet_data.text || ''
        };
      }
      // Fallback to Twitter's standard format
      else if (data.quoted_status) {
        quotedTweet = {
          text: data.quoted_status.text || data.quoted_status.full_text || ''
        };
      }

      const media = data.media || data.extended_entities?.media || data.entities?.media || [];

      // Debug log media details
      if (media.length > 0) {
        console.log('Found media:', media.map(m => ({
          type: m.type,
          url: m.media_url_https || m.media_url || m.url
        })));
      }

      return {
        text: data.text || data.full_text || '',
        media: media,
        quotedTweet: quotedTweet
      };
    } catch (e) {
      // Not JSON, just plain text
      console.log('Failed to parse tweet as JSON, treating as plain text');
      return { text: tweetJson, media: [], quotedTweet: null };
    }
  }

  private escapeHtml(text: string) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private calculateCommunityNoteLength(text: string) {
    // In Community Notes, URLs count as 1 character
    const urlRegex = /https?:\/\/[^\s]+/g;
    let charCount = 0;
    let lastIndex = 0;
    
    const matches = text.matchAll(urlRegex);
    for (const match of matches) {
      if (match.index !== undefined) {
        // Add the text before the URL
        charCount += match.index - lastIndex;
        // Add 1 for the URL
        charCount += 1;
        lastIndex = match.index + match[0].length;
      }
    }
    
    // Add any remaining text after the last URL
    charCount += text.length - lastIndex;
    
    return charCount;
  }

  private displayNoteWithLinks(elementId: string, noteText: string, status: string, wouldBePosted: boolean, rating?: number, botName?: string) {
    const element = this.getElement(elementId);
    if (!element) return;

    // Calculate Community Notes character count
    const charCount = this.calculateCommunityNoteLength(noteText);

    // Convert URLs to clickable links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const htmlText = this.escapeHtml(noteText).replace(urlRegex, (url) => {
      return `<a href="${url}" target="_blank" class="text-blue-500 hover:underline">${url}</a>`;
    });

    // Determine status color
    let statusColor = 'text-gray-600';
    if (status.includes('CORRECTION WITH TRUSTWORTHY CITATION')) {
      statusColor = 'text-green-600';
    } else if (status.includes('NOT MISLEADING')) {
      statusColor = 'text-blue-600';
    } else if (status.includes('OPINION') || status.includes('SATIRE')) {
      statusColor = 'text-orange-600';
    }

    // Display note with status at top, then note text, then metadata
    element.innerHTML = `
      <div>
        <div class="${statusColor} font-semibold mb-2">
          <i class="fas fa-tag mr-1"></i>${status}
        </div>
        <div class="${wouldBePosted ? 'text-green-600' : 'text-red-600'} font-semibold mb-3">
          <i class="fas ${wouldBePosted ? 'fa-check-circle' : 'fa-times-circle'} mr-1"></i>${wouldBePosted ? 'Would be posted' : 'Would NOT be posted'}
        </div>
        <div class="mb-2">${htmlText}</div>
        <div class="text-sm text-gray-500 space-y-1">
          <div>
            <i class="fas fa-text-width mr-1"></i>${charCount} characters
            ${charCount > 280 ? '<span class="text-red-500 ml-1">(exceeds limit)</span>' : ''}
            <span class="text-xs text-gray-400 ml-2">(URLs = 1 char)</span>
          </div>
          ${rating !== undefined ? `
          <div class="text-blue-600 font-semibold">
            <i class="fas fa-star mr-1"></i>Nathan Rating: ${rating.toFixed(2)}
          </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private handleComparison(result: 'left' | 'right' | 'draw' | 'skip') {
    if (this.currentPairIndex >= this.comparisonPairs.length) return;

    const pair = this.comparisonPairs[this.currentPairIndex];
    
    if (result !== 'skip') {
      // Create comparison record
      this.currentComparison = {
        tweetId: pair.tweet.id,
        leftBot: pair.leftNote.botName,
        rightBot: pair.rightNote.botName,
        winner: result === 'draw' ? null : (result === 'left' ? pair.leftNote.botName : pair.rightNote.botName),
        timestamp: new Date()
      };

      // Update Elo ratings
      if (result === 'draw') {
        this.eloCalculator.processComparison(pair.leftNote.botName, pair.rightNote.botName, true);
      } else if (result === 'left') {
        this.eloCalculator.processComparison(pair.leftNote.botName, pair.rightNote.botName, false);
      } else {
        this.eloCalculator.processComparison(pair.rightNote.botName, pair.leftNote.botName, false);
      }

      this.updateLeaderboard();

      // Show rating interface
      this.showRatingInterface();
    } else {
      // Skip - move to next comparison
      this.currentPairIndex++;
      this.updateProgress();
      this.displayCurrentComparison();
    }
  }

  private updateProgress() {
    const current = this.currentPairIndex;
    const total = this.comparisonPairs.length;
    const percent = total > 0 ? (current / total) * 100 : 0;

    const progressText = this.getElement('progressText');
    const progressPercent = this.getElement('progressPercent');
    const progressBar = this.getElement('progressBar');
    
    if (progressText) progressText.textContent = `${current} / ${total}`;
    if (progressPercent) progressPercent.textContent = `${Math.round(percent)}%`;
    if (progressBar) (progressBar as HTMLElement).style.width = `${percent}%`;
  }

  private updateLeaderboard() {
    const leaderboard = this.getElement('leaderboard');
    if (!leaderboard) return;
    const ratings = this.eloCalculator.getRatings();

    if (ratings.length === 0) {
      leaderboard.innerHTML = '<p class="text-gray-500 text-center py-8">No ratings yet</p>';
      return;
    }

    leaderboard.innerHTML = ratings.map((branch, index) => {
      const winRate = branch.totalGames > 0 
        ? ((branch.wins + branch.draws * 0.5) / branch.totalGames * 100).toFixed(1)
        : '0.0';
      
      return `
        <div class="border rounded-lg p-3 ${index === 0 ? 'bg-yellow-50 border-yellow-300' : 'bg-white'}">
          <div class="flex justify-between items-start">
            <div>
              <div class="font-semibold">${index + 1}. ${branch.name}</div>
              <div class="text-sm text-gray-600">
                ${branch.wins}W-${branch.losses}L-${branch.draws}D (${winRate}%)
              </div>
            </div>
            <div class="text-lg font-bold">${Math.round(branch.rating)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  private showInterface(interfaceId: string) {
    const interfaces = ['loadingState', 'comparisonInterface', 'ratingInterface', 'noMoreComparisons'];
    interfaces.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.classList.toggle('hidden', id !== interfaceId);
      }
    });
  }

  private showRatingInterface() {
    this.awaitingRating = true;
    const pair = this.comparisonPairs[this.currentPairIndex];

    // Show note text only in the preview
    const leftPreview = this.getElement('leftNotePreview');
    const rightPreview = this.getElement('rightNotePreview');

    if (leftPreview) {
      leftPreview.textContent = pair.leftNote.text;
    }
    if (rightPreview) {
      rightPreview.textContent = pair.rightNote.text;
    }

    // Show filter scores in separate section
    this.displayFilterScores('leftFilterScores', pair.leftNote);
    this.displayFilterScores('rightFilterScores', pair.rightNote);

    // Show full reports in separate box
    this.displayFullReport('leftFullReport', pair.leftNote);
    this.displayFullReport('rightFullReport', pair.rightNote);

    // Reset sliders and inputs to middle
    (document.getElementById('leftRating') as HTMLInputElement).value = '50';
    (document.getElementById('leftRatingInput') as HTMLInputElement).value = '0.50';
    (document.getElementById('rightRating') as HTMLInputElement).value = '50';
    (document.getElementById('rightRatingInput') as HTMLInputElement).value = '0.50';

    // Show existing ratings if available
    if (pair.leftNote.wouldNathanPost !== undefined) {
      const leftRating = pair.leftNote.wouldNathanPost;
      (document.getElementById('leftRating') as HTMLInputElement).value = (leftRating * 100).toString();
      (document.getElementById('leftRatingInput') as HTMLInputElement).value = leftRating.toFixed(2);
    }
    if (pair.rightNote.wouldNathanPost !== undefined) {
      const rightRating = pair.rightNote.wouldNathanPost;
      (document.getElementById('rightRating') as HTMLInputElement).value = (rightRating * 100).toString();
      (document.getElementById('rightRatingInput') as HTMLInputElement).value = rightRating.toFixed(2);
    }

    this.showInterface('ratingInterface');
  }

  private displayFilterScores(elementId: string, note: Note) {
    const element = this.getElement(elementId);
    if (!element) return;

    const scores = [];
    const threshold = 0.5;

    // Collect all available filter scores
    if (note.notSarcasmFilter !== undefined && note.notSarcasmFilter !== null) {
      scores.push({
        label: 'Not Sarcasm',
        value: note.notSarcasmFilter.toFixed(2),
        pass: note.notSarcasmFilter >= threshold
      });
    }
    if (note.urlFilter !== undefined && note.urlFilter !== null) {
      scores.push({
        label: 'URL Valid',
        value: note.urlFilter.toFixed(2),
        pass: note.urlFilter >= threshold
      });
    }
    if (note.characterCountFilter !== undefined && note.characterCountFilter !== null) {
      scores.push({
        label: 'Character Count',
        value: note.characterCountFilter.toFixed(2),
        pass: note.characterCountFilter >= threshold
      });
    }
    if (note.positiveClaimsFilter !== undefined && note.positiveClaimsFilter !== null) {
      scores.push({
        label: 'Positive Claims',
        value: note.positiveClaimsFilter.toFixed(2),
        pass: note.positiveClaimsFilter >= threshold
      });
    }
    if (note.significantCorrectionFilter !== undefined && note.significantCorrectionFilter !== null) {
      scores.push({
        label: 'Significant Correction',
        value: note.significantCorrectionFilter.toFixed(2),
        pass: note.significantCorrectionFilter >= threshold
      });
    }

    if (scores.length > 0) {
      element.innerHTML = `
        <h5 class="font-semibold text-sm mb-2">Filter Scores</h5>
        <div class="grid grid-cols-1 gap-1">
          ${scores.map(score => `
            <div class="flex justify-between text-xs">
              <span class="text-gray-600">${score.label}:</span>
              <span class="${score.pass ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}">
                ${score.value} ${score.pass ? '✓' : '✗'}
              </span>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      element.innerHTML = '<p class="text-xs text-gray-500">No filter scores available</p>';
    }
  }

  private displayFullReport(elementId: string, note: Note) {
    const element = this.getElement(elementId);
    if (!element) return;

    const preElement = element.querySelector('pre');
    if (preElement) {
      if (note.fullResult) {
        preElement.textContent = note.fullResult;
      } else {
        preElement.textContent = 'No full report available';
      }
    }
  }


  private extractFilterScores(fullResult: string): Array<{label: string, value: string, pass: boolean}> {
    const scores = [];

    // Extract filter scores from full result
    const patterns = [
      { regex: /Not sarcasm filter:\s*([\d.]+)/i, label: 'Not Sarcasm' },
      { regex: /URL filter:\s*([\d.]+)/i, label: 'URL Valid' },
      { regex: /Character count filter:\s*([\d.]+)/i, label: 'Character Count' },
      { regex: /Positive claims only filter:\s*([\d.]+)/i, label: 'Positive Claims' },
      { regex: /Significant correction filter:\s*([\d.]+)/i, label: 'Significant Correction' }
    ];

    for (const pattern of patterns) {
      const match = fullResult.match(pattern.regex);
      if (match) {
        const value = parseFloat(match[1]);
        scores.push({
          label: pattern.label,
          value: value.toFixed(2),
          pass: value >= 0.5
        });
      }
    }

    return scores;
  }

  private async submitRatings() {
    if (!this.currentComparison || !this.airtableClient) return;
    
    const pair = this.comparisonPairs[this.currentPairIndex];
    const leftRating = parseFloat((document.getElementById('leftRatingInput') as HTMLInputElement).value);
    const rightRating = parseFloat((document.getElementById('rightRatingInput') as HTMLInputElement).value);
    
    // Store ratings in the comparison
    this.currentComparison.leftRating = leftRating;
    this.currentComparison.rightRating = rightRating;
    
    // Update Airtable
    try {
      console.log('Updating ratings:', {
        leftNote: { recordId: pair.leftNote.recordId, rating: leftRating },
        rightNote: { recordId: pair.rightNote.recordId, rating: rightRating }
      });
      
      await Promise.all([
        this.airtableClient.updateNathanPostRating(pair.leftNote.recordId, leftRating),
        this.airtableClient.updateNathanPostRating(pair.rightNote.recordId, rightRating)
      ]);
      
      // Update local data
      pair.leftNote.wouldNathanPost = leftRating;
      pair.rightNote.wouldNathanPost = rightRating;
      
      console.log('Ratings updated successfully');
    } catch (error) {
      console.error('Failed to update Airtable ratings:', error);
      console.error('Left note record ID:', pair.leftNote.recordId);
      console.error('Right note record ID:', pair.rightNote.recordId);
      alert('Failed to save ratings to Airtable. Check console for details.');
    }
    
    // Save comparison and move to next
    this.comparisons.push(this.currentComparison);
    this.currentComparison = null;
    this.awaitingRating = false;
    
    this.currentPairIndex++;
    this.updateProgress();
    
    // Show next comparison or completion
    if (this.currentPairIndex < this.comparisonPairs.length) {
      this.showInterface('comparisonInterface');
      this.displayCurrentComparison();
    } else {
      this.showInterface('noMoreComparisons');
    }
  }

  private skipRatings() {
    if (!this.currentComparison) return;
    
    // Save comparison without ratings
    this.comparisons.push(this.currentComparison);
    this.currentComparison = null;
    this.awaitingRating = false;
    
    this.currentPairIndex++;
    this.updateProgress();
    
    // Show next comparison or completion
    if (this.currentPairIndex < this.comparisonPairs.length) {
      this.showInterface('comparisonInterface');
      this.displayCurrentComparison();
    } else {
      this.showInterface('noMoreComparisons');
    }
  }

  private exportResults() {
    const csv = this.eloCalculator.exportData();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `community-notes-elo-ratings-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new CommunityNotesComparison();
});
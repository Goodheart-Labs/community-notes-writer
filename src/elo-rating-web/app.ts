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

  private checkForCredentials(): void {
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

  private showCredentialsPrompt(): void {
    const loadingState = document.getElementById('loadingState')!;
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

  private initializeEventListeners(): void {
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

  private async fetchData(forceRefresh: boolean = false): Promise<void> {
    if (!this.airtableClient) return;

    const button = document.getElementById('fetchData') as HTMLButtonElement;
    const loadingState = document.getElementById('loadingState')!;
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
      const daysBack = parseInt((document.getElementById('dateRange') as HTMLSelectElement).value);
      
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
        document.getElementById('exportResults')!.removeAttribute('disabled');
      } else {
        this.showInterface('loadingState');
        const loadingState = document.getElementById('loadingState')!;
        loadingState.innerHTML = `
          <i class="fas fa-info-circle text-4xl text-gray-400 mb-4"></i>
          <p class="text-gray-600">No tweets found with multiple branch attempts in the selected time period.</p>
        `;
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      const loadingState = document.getElementById('loadingState')!;
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

  private generateComparisonPairs(): void {
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
    
    // Shuffle pairs
    this.comparisonPairs.sort(() => Math.random() - 0.5);
  }

  private displayCurrentComparison(): void {
    if (this.currentPairIndex >= this.comparisonPairs.length) {
      this.showInterface('noMoreComparisons');
      return;
    }

    const pair = this.comparisonPairs[this.currentPairIndex];
    
    // Display tweet
    const tweetContent = document.getElementById('tweetContent')!;
    const tweetData = this.parseTweetData(pair.tweet.text);
    
    // Build tweet display with media if available
    let tweetHtml = `<div class="space-y-3">`;
    tweetHtml += `<p>${this.escapeHtml(tweetData.text)}</p>`;
    
    if (tweetData.media && tweetData.media.length > 0) {
      tweetHtml += `<div class="grid grid-cols-2 gap-2">`;
      for (const media of tweetData.media) {
        if (media.type === 'photo') {
          tweetHtml += `<img src="${media.url}" alt="Tweet media" class="rounded-lg max-h-48 object-cover">`;
        }
      }
      tweetHtml += `</div>`;
    }
    
    if (tweetData.quotedTweet) {
      tweetHtml += `
        <div class="border rounded-lg p-3 bg-gray-50">
          <p class="text-sm text-gray-600 mb-1">Quote Tweet:</p>
          <p class="text-sm">${this.escapeHtml(tweetData.quotedTweet.text)}</p>
        </div>
      `;
    }
    
    tweetHtml += `</div>`;
    tweetContent.innerHTML = tweetHtml;
    
    // Display URL
    const tweetUrl = document.getElementById('tweetUrl')!;
    tweetUrl.innerHTML = `<a href="${pair.tweet.url}" target="_blank">${pair.tweet.url}</a>`;
    
    // Display notes with clickable links, character count, and existing ratings
    this.displayNoteWithLinks('leftNote', pair.leftNote.text, pair.leftNote.status, pair.leftNote.wouldNathanPost);
    this.displayNoteWithLinks('rightNote', pair.rightNote.text, pair.rightNote.status, pair.rightNote.wouldNathanPost);
    
    // Show notice if both notes already have ratings
    const ratingsNotice = document.getElementById('existingRatingsNotice')!;
    if (pair.leftNote.wouldNathanPost !== undefined && pair.rightNote.wouldNathanPost !== undefined) {
      ratingsNotice.classList.remove('hidden');
    } else {
      ratingsNotice.classList.add('hidden');
    }
  }

  private parseTweetData(tweetJson: string): any {
    try {
      const data = JSON.parse(tweetJson);
      return {
        text: data.text || data.full_text || '',
        media: data.extended_entities?.media || data.entities?.media || [],
        quotedTweet: data.quoted_status ? {
          text: data.quoted_status.text || data.quoted_status.full_text || ''
        } : null
      };
    } catch (e) {
      return { text: tweetJson, media: [], quotedTweet: null };
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private calculateCommunityNoteLength(text: string): number {
    // In Community Notes, URLs count as 1 character
    const urlRegex = /https?:\/\/[^\s]+/g;
    let charCount = 0;
    let lastIndex = 0;
    
    const matches = text.matchAll(urlRegex);
    for (const match of matches) {
      // Add the text before the URL
      charCount += match.index! - lastIndex;
      // Add 1 for the URL
      charCount += 1;
      lastIndex = match.index! + match[0].length;
    }
    
    // Add any remaining text after the last URL
    charCount += text.length - lastIndex;
    
    return charCount;
  }

  private displayNoteWithLinks(elementId: string, noteText: string, status: string, rating?: number): void {
    const element = document.getElementById(elementId)!;
    
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
    
    // Display note with character count, status, and rating if available
    element.innerHTML = `
      <div>
        <div class="mb-2">${htmlText}</div>
        <div class="text-sm text-gray-500 space-y-1">
          <div>
            <i class="fas fa-text-width mr-1"></i>${charCount} characters
            ${charCount > 280 ? '<span class="text-red-500 ml-1">(exceeds limit)</span>' : ''}
            <span class="text-xs text-gray-400 ml-2">(URLs = 1 char)</span>
          </div>
          <div class="${statusColor}">
            <i class="fas fa-tag mr-1"></i>${status}
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

  private handleComparison(result: 'left' | 'right' | 'draw' | 'skip'): void {
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

  private updateProgress(): void {
    const current = this.currentPairIndex;
    const total = this.comparisonPairs.length;
    const percent = total > 0 ? (current / total) * 100 : 0;

    document.getElementById('progressText')!.textContent = `${current} / ${total}`;
    document.getElementById('progressPercent')!.textContent = `${Math.round(percent)}%`;
    document.getElementById('progressBar')!.style.width = `${percent}%`;
  }

  private updateLeaderboard(): void {
    const leaderboard = document.getElementById('leaderboard')!;
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

  private showInterface(interfaceId: string): void {
    const interfaces = ['loadingState', 'comparisonInterface', 'ratingInterface', 'noMoreComparisons'];
    interfaces.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.classList.toggle('hidden', id !== interfaceId);
      }
    });
  }

  private showRatingInterface(): void {
    this.awaitingRating = true;
    const pair = this.comparisonPairs[this.currentPairIndex];
    
    // Show note previews
    const leftPreview = document.getElementById('leftNotePreview')!;
    const rightPreview = document.getElementById('rightNotePreview')!;
    
    leftPreview.textContent = pair.leftNote.text;
    rightPreview.textContent = pair.rightNote.text;
    
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

  private async submitRatings(): Promise<void> {
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

  private skipRatings(): void {
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

  private exportResults(): void {
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
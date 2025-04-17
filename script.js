// Stock data storage
let stockMentions = {};
let currentTimeframe = 'all';

// Define a CORS proxy URL (you may need to change this or request access)
const CORS_PROXY = 'https://corsproxy.io/?';

// Load tickers
const knownTickers = new Set();
const commonTickers = [
  'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA', 'NVDA', 'AMD', 'INTC',
  'NFLX', 'PYPL', 'ADBE', 'CSCO', 'CMCSA', 'PEP', 'AVGO', 'TXN', 'QCOM',
  'COST', 'TMUS', 'AMGN', 'SBUX', 'GILD', 'MDLZ', 'INTU', 'ISRG', 'VRTX',
  'REGN', 'ILMN', 'ATVI', 'BKNG', 'CHTR', 'MAR', 'MNST', 'SIRI', 'SPY',
  'QQQ', 'IWM', 'DIA', 'ARKK', 'XLF', 'XLE', 'XLV', 'XLU', 'XLI'
];
commonTickers.forEach(ticker => knownTickers.add(ticker));

// Try to load additional tickers if available
try {
  fetch('tickers.txt')
    .then(response => {
      if (response.ok) return response.text();
      throw new Error('Tickers file not found');
    })
    .then(data => {
      data.split('\n').forEach(ticker => {
        if (ticker.trim()) knownTickers.add(ticker.trim());
      });
      console.log(`Loaded ${knownTickers.size} stock tickers`);
    })
    .catch(err => {
      console.log('Using default tickers list');
    });
} catch (e) {
  console.log('Using default tickers list');
}

// Regex patterns
const tickerPattern = /\b[A-Z]{1,5}\b/g; // Potential stock tickers
const stockRelatedTerms = ['stock', 'trade', 'chart', 'position', 'entry', 'exit', 'buy', 'sell', 'bullish', 'bearish', 'call', 'put', 'option'];

// Simple sentiment analysis function
function analyzeSentiment(text) {
  const bullishTerms = ['buy', 'long', 'call', 'bullish', 'up', 'moon', 'rocket', '🚀', '📈', 'support', 'higher', 'strong', 'breakout'];
  const bearishTerms = ['sell', 'short', 'put', 'bearish', 'down', 'crash', 'dump', '📉', 'resistance', 'lower', 'weak', 'breakdown'];
  
  text = text.toLowerCase();
  let score = 0;
  
  bullishTerms.forEach(term => {
    if (text.includes(term)) score += 1;
  });
  
  bearishTerms.forEach(term => {
    if (text.includes(term)) score -= 1;
  });
  
  return score;
}

// Extract stock mentions from message
function extractStockMentions(message) {
  try {
    const text = message.content || '';
    const username = message.author?.username || 'unknown';
    const potentialTickers = text.match(tickerPattern) || [];
    const now = Date.now();
    
    // Check if text is stock-related
    const isStockRelated = stockRelatedTerms.some(term => 
      text.toLowerCase().includes(term.toLowerCase())
    ) || text.includes('$');
    
    // Process each potential ticker
    potentialTickers.forEach(ticker => {
      // Skip common non-stock uppercase words
      if (['I', 'A', 'THE', 'AND', 'OR', 'IF', 'BUT'].includes(ticker)) {
        return;
      }
      
      // Filter for known tickers or stock context
      if (knownTickers.has(ticker) || text.includes(`$${ticker}`) || isStockRelated) {
        if (!stockMentions[ticker]) {
          stockMentions[ticker] = {
            mentions: 0,
            sentiment: 0,
            totalSentiment: 0,
            contexts: [],
            users: new Set(),
            firstMentioned: now,
            lastMentioned: now
          };
        }
        
        const stock = stockMentions[ticker];
        stock.mentions++;
        
        // Calculate sentiment
        const messageSentiment = analyzeSentiment(text);
        stock.totalSentiment += messageSentiment;
        stock.sentiment = stock.totalSentiment / stock.mentions;
        
        // Store context (up to 5 most recent)
        if (stock.contexts.length >= 5) stock.contexts.shift();
        stock.contexts.push({
          text: text.slice(0, 150) + (text.length > 150 ? '...' : ''),
          username,
          timestamp: now
        });
        
        // Update user set
        stock.users.add(username);
        
        // Update timestamps
        stock.lastMentioned = now;
      }
    });
  } catch (error) {
    console.error("Error extracting stock mentions:", error);
  }
}

// Filter stocks based on timeframe
function filterStocksByTimeframe(timeframe) {
  const now = Date.now();
  let timeThreshold;
  
  // Set time threshold based on timeframe
  switch (timeframe) {
    case '1h': timeThreshold = now - 60 * 60 * 1000; break;
    case '4h': timeThreshold = now - 4 * 60 * 60 * 1000; break;
    case '1d': timeThreshold = now - 24 * 60 * 60 * 1000; break;
    case 'all': timeThreshold = 0; break;
    default: timeThreshold = 0;
  }
  
  // Filter and sort stocks
  return Object.entries(stockMentions)
    .filter(([_, data]) => data.lastMentioned >= timeThreshold)
    .map(([ticker, data]) => ({
      ticker,
      mentions: data.mentions,
      sentiment: data.sentiment,
      uniqueUsers: data.users.size,
      contexts: data.contexts,
      recency: data.lastMentioned
    }))
    .sort((a, b) => {
      // Primary sort by mentions, secondary by sentiment for same mention count
      if (b.mentions !== a.mentions) return b.mentions - a.mentions;
      return b.sentiment - a.sentiment;
    });
}

// Generate summary stats
function generateSummaryStats(timeframe) {
  const stocks = filterStocksByTimeframe(timeframe);
  
  // Calculate stats
  const bullishStocks = stocks.filter(s => s.sentiment > 0.5);
  const bearishStocks = stocks.filter(s => s.sentiment < -0.5);
  const neutralStocks = stocks.filter(s => s.sentiment >= -0.5 && s.sentiment <= 0.5);
  
  return {
    totalStocks: stocks.length,
    bullish: bullishStocks.length,
    bearish: bearishStocks.length,
    neutral: neutralStocks.length,
    topStocks: stocks.slice(0, 10)
  };
}

// Update UI with current data
function updateUI() {
  try {
    const stats = generateSummaryStats(currentTimeframe);
    
    // Update summary timestamp
    document.getElementById('summaryTimestamp').textContent = `Summary as of ${new Date().toLocaleString()}`;
    
    // Update top tickers
    const topTickersContainer = document.getElementById('topTickers');
    topTickersContainer.innerHTML = '';
    
    stats.topStocks.slice(0, 5).forEach(stock => {
      const sentimentClass = stock.sentiment > 0.5 ? 'bg-success text-white' : 
                          stock.sentiment < -0.5 ? 'bg-danger text-white' : 
                          'bg-secondary text-white';
      
      const badge = document.createElement('span');
      badge.className = `ticker-badge ${sentimentClass}`;
      badge.textContent = `$${stock.ticker}`;
      topTickersContainer.appendChild(badge);
    });
    
    // Update sentiment chart
    if (window.sentimentChart) window.sentimentChart.destroy();
    const sentimentCtx = document.getElementById('sentimentChart').getContext('2d');
    window.sentimentChart = new Chart(sentimentCtx, {
      type: 'pie',
      data: {
        labels: ['Bullish', 'Neutral', 'Bearish'],
        datasets: [{
          data: [stats.bullish, stats.neutral, stats.bearish],
          backgroundColor: ['#28a745', '#6c757d', '#dc3545']
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
    
    // Update mentions chart
    if (window.mentionsChart) window.mentionsChart.destroy();
    const mentionsCtx = document.getElementById('mentionsChart').getContext('2d');
    window.mentionsChart = new Chart(mentionsCtx, {
      type: 'bar',
      data: {
        labels: stats.topStocks.slice(0, 5).map(s => s.ticker),
        datasets: [{
          label: 'Mentions',
          data: stats.topStocks.slice(0, 5).map(s => s.mentions),
          backgroundColor: stats.topStocks.slice(0, 5).map(s => 
            s.sentiment > 0.5 ? '#28a745' : 
            s.sentiment < -0.5 ? '#dc3545' : 
            '#6c757d'
          )
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0
            }
          }
        },
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
    
    // Update detailed table
    const tableBody = document.getElementById('detailedTable');
    tableBody.innerHTML = '';
    
    stats.topStocks.forEach(stock => {
      const tr = document.createElement('tr');
      
      // Ticker cell
      const tickerCell = document.createElement('td');
      tickerCell.innerHTML = `<strong>$${stock.ticker}</strong>`;
      tr.appendChild(tickerCell);
      
      // Mentions cell
      const mentionsCell = document.createElement('td');
      mentionsCell.textContent = stock.mentions;
      tr.appendChild(mentionsCell);
      
      // Sentiment cell
      const sentimentCell = document.createElement('td');
      let sentimentText, sentimentClass;
      
      if (stock.sentiment > 0.5) {
        sentimentText = 'Bullish';
        sentimentClass = 'sentiment-bullish';
      } else if (stock.sentiment < -0.5) {
        sentimentText = 'Bearish';
        sentimentClass = 'sentiment-bearish';
      } else {
        sentimentText = 'Neutral';
        sentimentClass = 'sentiment-neutral';
      }
      
      sentimentCell.innerHTML = `<span class="${sentimentClass}">${sentimentText}</span>`;
      tr.appendChild(sentimentCell);
      
      // Users cell
      const usersCell = document.createElement('td');
      usersCell.textContent = stock.uniqueUsers;
      tr.appendChild(usersCell);
      
      // Context cell
      const contextCell = document.createElement('td');
      if (stock.contexts && stock.contexts.length > 0) {
        const latestContext = stock.contexts[stock.contexts.length - 1];
        contextCell.innerHTML = `
          <div class="context-quote">${latestContext.text}</div>
          <small class="text-muted">by ${latestContext.username} - ${new Date(latestContext.timestamp).toLocaleTimeString()}</small>
        `;
      } else {
        contextCell.textContent = 'No context available';
      }
      tr.appendChild(contextCell);
      
      tableBody.appendChild(tr);
    });
    
    // Show summary container
    document.getElementById('summaryContainer').style.display = 'block';
    
    // Apply mobile-specific optimizations
    applyMobileOptimizations();
    
    // Hide loading screen
    hideLoading();
    
    // Update refresh timestamp for mobile view
    const timestampEl = document.getElementById('mobileTimestamp');
    if (timestampEl) {
      timestampEl.textContent = new Date().toLocaleTimeString();
    }
  } catch (error) {
    console.error("Error updating UI:", error);
    hideLoading();
    alert("Error updating UI. See console for details.");
  }
}

// Fetch Discord messages using a CORS proxy
async function fetchDiscordMessages(channelId, messageCount, token) {
  showLoading('Connecting to Discord...');
  
  try {
    // Use CORS proxy to bypass CORS restrictions
    const discordApiUrl = `https://discord.com/api/v9/channels/${channelId}/messages?limit=${messageCount}`;
    const response = await fetch(`${CORS_PROXY}${encodeURIComponent(discordApiUrl)}`, {
      headers: {
        'Authorization': token
      }
    });
    
    if (!response.ok) {
      hideLoading();
      if (response.status === 401) {
        alert('Authorization failed. Please check your Discord token.');
      } else if (response.status === 404) {
        alert('Channel not found. Please check the channel ID.');
      } else if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || 60;
        alert(`Rate limited by Discord. Please try again in ${retryAfter} seconds.`);
      } else {
        alert(`Error: ${response.status} - ${response.statusText}`);
      }
      return null;
    }
    
    return await response.json();
  } catch (error) {
    hideLoading();
    console.error("Fetch error:", error);
    alert(`Failed to fetch messages: ${error.message}\n\nCORS issues may be preventing access to Discord's API. Try using a CORS proxy extension, or run the application locally.`);
    return null;
  }
}

// Process Discord messages
async function processDiscordMessages(messages) {
  showLoading('Analyzing messages...');
  
  try {
    // Reset stock mentions
    stockMentions = {};
    
    // Process each message
    for (let i = 0; i < messages.length; i++) {
      updateLoadingMessage(`Processing message ${i + 1} of ${messages.length}...`);
      extractStockMentions(messages[i]);
    }
    
    // Update UI
    updateUI();
    hideLoading();
  } catch (error) {
    console.error("Error processing messages:", error);
    hideLoading();
    alert("Error processing messages. See console for details.");
  }
}

// Loading screen functions
function showLoading(message) {
  document.getElementById('loadingScreen').style.display = 'flex';
  document.getElementById('loadingMessage').textContent = message;
}

function updateLoadingMessage(message) {
  document.getElementById('loadingMessage').textContent = message;
}

function hideLoading() {
  document.getElementById('loadingScreen').style.display = 'none';
}

// Export data as CSV
function exportData() {
  const timeframe = currentTimeframe;
  const stocks = filterStocksByTimeframe(timeframe);
  
  let csv = 'Ticker,Mentions,Sentiment,Unique Users,Last Mentioned\n';
  
  stocks.forEach(stock => {
    const sentimentText = stock.sentiment > 0.5 ? 'Bullish' : stock.sentiment < -0.5 ? 'Bearish' : 'Neutral';
    const lastMentionedDate = new Date(stock.recency).toLocaleString();
    
    csv += `${stock.ticker},${stock.mentions},${sentimentText},${stock.uniqueUsers},${lastMentionedDate}\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', `stock_summary_${timeframe}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Auto-refresh functionality
let autoRefreshInterval = null;
let lastRefreshTime = 0;
const MIN_REFRESH_INTERVAL = 60 * 1000; // 1 minute in milliseconds

function startAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
  
  const refreshIntervalInput = document.getElementById('refreshInterval');
  let refreshInterval = parseInt(refreshIntervalInput.value) * 1000; // Convert seconds to milliseconds
  
  // Enforce minimum refresh interval
  if (refreshInterval < MIN_REFRESH_INTERVAL) {
    refreshInterval = MIN_REFRESH_INTERVAL;
    refreshIntervalInput.value = MIN_REFRESH_INTERVAL / 1000;
    alert(`Refresh interval set to minimum safe value (${MIN_REFRESH_INTERVAL / 1000} seconds) to avoid Discord rate limits`);
  }
  
  document.getElementById('autoRefreshStatus').textContent = `Auto-refresh: Active (every ${refreshInterval / 1000} seconds)`;
  document.getElementById('autoRefreshStatus').className = 'badge bg-success';
  
  // Update mobile button if exists
  const mobileAutoBtn = document.getElementById('mobileAutoRefreshBtn');
  if (mobileAutoBtn) {
    mobileAutoBtn.querySelector('i').className = 'bi bi-pause-circle';
    mobileAutoBtn.querySelector('small').textContent = 'Pause';
  }
  
  autoRefreshInterval = setInterval(async function() {
    // Check if enough time has passed since the last refresh
    const now = Date.now();
    if (now - lastRefreshTime >= refreshInterval) {
      console.log(`Auto-refreshing data (${new Date().toLocaleTimeString()})...`);
      lastRefreshTime = now;
      document.getElementById('startAnalysisBtn').click();
    }
  }, 5000); // Check every 5 seconds
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
    document.getElementById('autoRefreshStatus').textContent = 'Auto-refresh: Inactive';
    document.getElementById('autoRefreshStatus').className = 'badge bg-secondary';
    
    // Update mobile button if exists
    const mobileAutoBtn = document.getElementById('mobileAutoRefreshBtn');
    if (mobileAutoBtn) {
      mobileAutoBtn.querySelector('i').className = 'bi bi-play-circle';
      mobileAutoBtn.querySelector('small').textContent = 'Auto';
    }
  }
}

// Check if device is mobile
function isMobileDevice() {
  return (window.innerWidth <= 768) || 
         (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
}

// Apply mobile optimizations if needed
function applyMobileOptimizations() {
  if (isMobileDevice()) {
    // Adjust chart options for better mobile viewing
    if (window.sentimentChart) {
      window.sentimentChart.options.plugins.legend.position = 'bottom';
      window.sentimentChart.update();
    }
    
    if (window.mentionsChart) {
      window.mentionsChart.options.scales.y.ticks.display = window.innerWidth > 375;
      window.mentionsChart.update();
    }
    
    // Show PWA install prompt for iOS
    if ('standalone' in navigator && !navigator.standalone) {
      setTimeout(() => {
        showInstallPrompt();
      }, 3000);
    }
  }
}

// Show install prompt for iOS
function showInstallPrompt() {
  // Check if we've already shown the prompt
  if (localStorage.getItem('pwaPromptShown')) return;
  
  const installPrompt = document.createElement('div');
  installPrompt.className = 'pwa-install-prompt';
  installPrompt.innerHTML = `
    <div class="d-flex justify-content-between align-items-center">
      <div>
        <strong>Add to Home Screen</strong>
        <p class="mb-0 small">Install this app on your home screen for quick access</p>
      </div>
      <button class="btn btn-sm btn-outline-secondary close-prompt">Dismiss</button>
    </div>
  `;
  document.body.appendChild(installPrompt);
  
  installPrompt.style.display = 'block';
  document.querySelector('.close-prompt').addEventListener('click', function() {
    installPrompt.style.display = 'none';
    localStorage.setItem('pwaPromptShown', 'true');
  });
}

// Pull-to-refresh functionality for mobile
let startY, endY;
const minPullDistance = 80;
let refreshing = false;

document.addEventListener('touchstart', function(e) {
  startY = e.touches[0].clientY;
  const pullToRefreshEl = document.querySelector('.pull-to-refresh');
  if (pullToRefreshEl) pullToRefreshEl.style.display = 'block';
});

document.addEventListener('touchmove', function(e) {
  if (!startY || refreshing) return;
  
  const currentY = e.touches[0].clientY;
  const distance = currentY - startY;
  
  if (distance > 0 && window.scrollY === 0) {
    // User is pulling down and we're at the top of the page
    const pullToRefreshEl = document.querySelector('.pull-to-refresh');
    if (pullToRefreshEl) {
      pullToRefreshEl.style.height = Math.min(distance, minPullDistance) + 'px';
      pullToRefreshEl.innerHTML = distance >= minPullDistance ? 
        'Release to refresh' : 'Pull down to refresh';
    }
    
    // Prevent default scrolling
    e.preventDefault();
  }
});

document.addEventListener('touchend', function(e) {
  if (!startY || refreshing) return;
  
  endY = e.changedTouches[0].clientY;
  const distance = endY - startY;
  
  if (distance > minPullDistance && window.scrollY === 0) {
    // User has pulled down enough to trigger refresh
    const pullToRefreshEl = document.querySelector('.pull-to-refresh');
    if (pullToRefreshEl) {
      pullToRefreshEl.innerHTML = 'Refreshing...';
      pullToRefreshEl.style.height = '40px';
    }
    
    refreshing = true;
    
    // Trigger refresh
    document.getElementById('startAnalysisBtn').click();
    
    // Reset after refresh completes (set a timeout to ensure the refresh has enough time)
    setTimeout(function() {
      if (pullToRefreshEl) {
        pullToRefreshEl.style.height = '0';
        pullToRefreshEl.innerHTML = 'Pull down to refresh';
      }
      refreshing = false;
    }, 2000);
  } else {
    // Not pulled enough, reset
    const pullToRefreshEl = document.querySelector('.pull-to-refresh');
    if (pullToRefreshEl) {
      pullToRefreshEl.style.height = '0';
      pullToRefreshEl.innerHTML = 'Pull down to refresh';
    }
  }
  
  startY = null;
});

// Local storage for saving token
function saveSettings() {
  const channelId = document.getElementById('channelId').value;
  const messageCount = document.getElementById('messageCount').value;
  const refreshInterval = document.getElementById('refreshInterval').value;
  
  if (channelId) {
    localStorage.setItem('discord_channel_id', channelId);
    localStorage.setItem('message_count', messageCount);
    localStorage.setItem('refresh_interval', refreshInterval);
    // We don't save the token for security
  }
}

// Load settings
function loadSettings() {
  const channelId = localStorage.getItem('discord_channel_id');
  const messageCount = localStorage.getItem('message_count');
  const refreshInterval = localStorage.getItem('refresh_interval');
  
  if (channelId) document.getElementById('channelId').value = channelId;
  if (messageCount) document.getElementById('messageCount').value = messageCount;
  if (refreshInterval) document.getElementById('refreshInterval').value = refreshInterval;
}

// Mobile-specific event handlers
function setupMobileHandlers() {
  // Sync settings between main UI and mobile modal
  const syncSettings = () => {
    document.getElementById('modalDiscordToken').value = document.getElementById('discordToken').value;
    document.getElementById('modalChannelId').value = document.getElementById('channelId').value;
    document.getElementById('modalMessageCount').value = document.getElementById('messageCount').value;
    document.getElementById('modalAutoRefreshToggle').checked = document.getElementById('autoRefreshToggle').checked;
    document.getElementById('modalRefreshInterval').value = document.getElementById('refreshInterval').value;
  };
  
  // When settings modal is shown, sync settings
  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal) {
    settingsModal.addEventListener('show.bs.modal', syncSettings);
  }
  
  // Save settings from modal
  document.getElementById('saveSettingsBtn')?.addEventListener('click', function() {
    document.getElementById('discordToken').value = document.getElementById('modalDiscordToken').value;
    document.getElementById('channelId').value = document.getElementById('modalChannelId').value;
    document.getElementById('messageCount').value = document.getElementById('modalMessageCount').value;
    
    // Handle auto-refresh toggle
    const wasEnabled = document.getElementById('autoRefreshToggle').checked;
    const isEnabled = document.getElementById('modalAutoRefreshToggle').checked;
    document.getElementById('autoRefreshToggle').checked = isEnabled;
    
    // Update refresh interval
    document.getElementById('refreshInterval').value = document.getElementById('modalRefreshInterval').value;
    
    // Toggle auto-refresh if needed
    if (wasEnabled !== isEnabled) {
      if (isEnabled) {
        startAutoRefresh();
      } else {
        stopAutoRefresh();
      }
    } else if (isEnabled) {
      // Restart with new interval
      startAutoRefresh();
    }
    
    // Save settings
    saveSettings();
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
    if (modal) modal.hide();
  });
  
  // Mobile button handlers
  document.getElementById('mobileRefreshBtn')?.addEventListener('click', function() {
    document.getElementById('startAnalysisBtn').click();
  });
  
  document.getElementById('mobileAutoRefreshBtn')?.addEventListener('click', function() {
    const toggle = document.getElementById('autoRefreshToggle');
    toggle.checked = !toggle.checked;
    
    if (toggle.checked) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  });
  
  document.getElementById('mobileExportBtn')?.addEventListener('click', function() {
    exportData();
  });
}

// Register service worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./service-worker.js')
      .then(function(registration) {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(function(err) {
        console.log('ServiceWorker registration failed: ', err);
      });
  });
}

// Document ready
document.addEventListener('DOMContentLoaded', function() {
  // Load saved settings
  loadSettings();
  
  // Setup mobile event handlers
  setupMobileHandlers();
  
  // Start analysis button
  document.getElementById('startAnalysisBtn').addEventListener('click', async function() {
    const token = document.getElementById('discordToken').value;
    const channelId = document.getElementById('channelId').value;
    const messageCount = document.getElementById('messageCount').value;
    
    if (!token) {
      alert('Please enter your Discord token');
      return;
    }
    
    if (!channelId) {
      alert('Please enter the channel ID');
      return;
    }
    
    const messages = await fetchDiscordMessages(channelId, messageCount, token);
    if (messages) {
      await processDiscordMessages(messages);
      lastRefreshTime = Date.now();
      
      // Save settings
      saveSettings();
    }
  });
  
  // Auto-refresh toggle
  document.getElementById('autoRefreshToggle').addEventListener('change', function() {
    if (this.checked) {
      // First run an initial fetch if we haven't already
      if (Object.keys(stockMentions).length === 0) {
        document.getElementById('startAnalysisBtn').click();
      } else {
        startAutoRefresh();
      }
    } else {
      stopAutoRefresh();
    }
  });
  
  // Timeframe buttons
  document.querySelectorAll('.timeframeBtn').forEach(button => {
    button.addEventListener('click', function() {
      // Update active button
      document.querySelectorAll('.timeframeBtn').forEach(btn => {
        btn.classList.remove('active');
      });
      this.classList.add('active');
      
      // Update timeframe and refresh UI
      currentTimeframe = this.getAttribute('data-timeframe');
      updateUI();
    });
  });
  
  // Export button
  document.getElementById('exportBtn').addEventListener('click', exportData);
  
  // Refresh button
  document.getElementById('refreshBtn').addEventListener('click', function() {
    document.getElementById('startAnalysisBtn').click();
  });
  
  // Show a helpful message about CORS
  console.log("Discord Stock Tracker loaded. Using CORS proxy to bypass browser restrictions.");
});

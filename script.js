// Stock data storage
let stockMentions = {};
let currentTimeframe = 'all';

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

// Load additional tickers if available
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
  const text = message.content;
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
    tickerCell.innerHTML = `<strong>${stock.ticker}</strong>`;
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
}

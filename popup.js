// Load saved API key on popup open
document.addEventListener('DOMContentLoaded', async () => {
  const result = await chrome.storage.local.get(['apiKey', 'history', 'cart', 'rewardsPoints']);
  
  // Check if API key exists and hide the section if it does
  if (result.apiKey) {
    document.getElementById('apiKeySection').style.display = 'none';
  } else {
    document.getElementById('apiKeySection').style.display = 'block';
  }
  
  // Load and display history
  if (result.history) {
    displayHistory(result.history);
  }

  // Load and display cart
  if (result.cart) {
    displayCart(result.cart);
  }

  // Load and display rewards
  const rewardsPoints = result.rewardsPoints || 0;
  updateRewardsDisplay(rewardsPoints);
});

// Save API key
document.getElementById('saveApiKey').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (apiKey) {
    await chrome.storage.local.set({ apiKey });
    // Clear the input field
    document.getElementById('apiKey').value = '';
    // Hide the entire section
    document.getElementById('apiKeySection').style.display = 'none';
    alert('API key saved securely! You can now analyze products.');
  } else {
    alert('Please enter a valid API key');
  }
});

// Settings button to toggle API key section
document.getElementById('settingsBtn').addEventListener('click', () => {
  const section = document.getElementById('apiKeySection');
  const rewardsSection = document.getElementById('rewardsSection');
  
  // Hide rewards if open
  rewardsSection.style.display = 'none';
  
  if (section.style.display === 'none') {
    section.style.display = 'block';
  } else {
    section.style.display = 'none';
  }
});

// Rewards button to toggle rewards section
document.getElementById('rewardsBtn').addEventListener('click', () => {
  const section = document.getElementById('rewardsSection');
  const apiKeySection = document.getElementById('apiKeySection');
  
  // Hide API key section if open
  apiKeySection.style.display = 'none';
  
  if (section.style.display === 'none') {
    section.style.display = 'block';
  } else {
    section.style.display = 'none';
  }
});

// Close rewards button
document.getElementById('closeRewards').addEventListener('click', () => {
  document.getElementById('rewardsSection').style.display = 'none';
});

// Reset rewards button
document.getElementById('resetRewards').addEventListener('click', async () => {
  if (confirm('Start a new rewards challenge? This will reset your progress.')) {
    await chrome.storage.local.set({ rewardsPoints: 0 });
    updateRewardsDisplay(0);
  }
});

// Add to cart button
document.getElementById('addToCartBtn').addEventListener('click', async () => {
  const result = await chrome.storage.local.get(['cart', 'rewardsPoints']);
  const cart = result.cart || [];
  const rewardsPoints = result.rewardsPoints || 0;

  // Get the current analysis data
  const analysisDiv = document.getElementById('analysis');
  if (analysisDiv.style.display === 'none') {
    alert('Please analyze a product first before adding to cart!');
    return;
  }

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Get the last analysis from history
  const historyResult = await chrome.storage.local.get(['history']);
  const history = historyResult.history || [];
  
  if (history.length === 0) {
    alert('No product analyzed yet!');
    return;
  }

  const lastAnalysis = history[0];

  // Check if already in cart
  const alreadyInCart = cart.some(item => item.url === lastAnalysis.url);
  if (alreadyInCart) {
    alert('This item is already in your cart!');
    return;
  }

  // Add to cart
  cart.push({
    title: lastAnalysis.title,
    url: lastAnalysis.url,
    analysis: lastAnalysis.analysis,
    timestamp: new Date().toISOString()
  });

  await chrome.storage.local.set({ cart });
  displayCart(cart);

  // Calculate points based on score
  const score = lastAnalysis.analysis.overall || lastAnalysis.analysis.score || 0;
  let pointsEarned = 0;
  
  if (score >= 9.0) {
    pointsEarned = 30;
  } else if (score >= 8.0) {
    pointsEarned = 15;
  } else if (score >= 7.0) {
    pointsEarned = 5;
  }

  if (pointsEarned > 0) {
    const newRewardsPoints = rewardsPoints + pointsEarned;
    await chrome.storage.local.set({ rewardsPoints: newRewardsPoints });
    updateRewardsDisplay(newRewardsPoints);
    
    if (newRewardsPoints >= 10) {
      alert(`🎉 Added to cart! +${pointsEarned} points! You just unlocked a coupon! Click the 🎁 icon to claim it!`);
    } else {
      alert(`🌟 Added to cart! +${pointsEarned} points earned! (${newRewardsPoints}/10 pts to next coupon)`);
    }
  } else {
    alert('Added to cart! 🛒 (Score 7+ to earn rewards points)');
  }
});

// Clear cart button
document.getElementById('clearCart').addEventListener('click', async () => {
  if (confirm('Clear all items from cart?')) {
    await chrome.storage.local.set({ cart: [] });
    displayCart([]);
  }
});

// Toggle collapsible sections
function toggleSection(sectionId) {
  const content = document.getElementById('content-' + sectionId);
  const header = content.previousElementSibling;
  
  if (content.classList.contains('active')) {
    content.classList.remove('active');
    header.classList.remove('active');
  } else {
    content.classList.add('active');
    header.classList.add('active');
  }
}

// Analyze button
document.getElementById('analyzeBtn').addEventListener('click', async () => {
  // Get API key from storage
  const result = await chrome.storage.local.get(['apiKey']);
  const apiKey = result.apiKey;
  
  if (!apiKey) {
    showError('Please enter your Claude API key first!');
    document.getElementById('apiKeySection').style.display = 'block';
    return;
  }

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Show loading
  showLoading();

  try {
    // Extract product info from the page
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractProductInfo
    });

    const productInfo = result.result;

    if (!productInfo.title) {
      showError('Could not detect product information on this page. Try visiting a product page on Amazon, eBay, or another shopping site.');
      return;
    }

    // Call Claude API
    const analysis = await analyzeSustainability(apiKey, productInfo);
    
    // Display results
    displayResults(analysis);

    // Save to history
    await saveToHistory({
      title: productInfo.title,
      url: tab.url,
      analysis: analysis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error:', error);
    showError('Error: ' + error.message);
  }
});

// Clear history button
document.getElementById('clearHistory').addEventListener('click', async () => {
  if (confirm('Clear all history?')) {
    await chrome.storage.local.set({ history: [] });
    displayHistory([]);
  }
});

// Function to extract product info from page (runs in page context)
function extractProductInfo() {
  const info = {
    title: '',
    price: '',
    description: '',
    brand: '',
    url: window.location.href
  };

  // Try to extract title (common selectors across shopping sites)
  const titleSelectors = [
    '#productTitle', // Amazon
    'h1[class*="product"]',
    'h1[class*="title"]',
    '.product-title',
    'h1',
    'meta[property="og:title"]'
  ];

  for (const selector of titleSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      info.title = element.getAttribute('content') || element.textContent.trim();
      if (info.title) break;
    }
  }

  // Try to extract price
  const priceSelectors = [
    '.a-price-whole', // Amazon
    '[class*="price"]',
    'meta[property="og:price:amount"]'
  ];

  for (const selector of priceSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      info.price = element.getAttribute('content') || element.textContent.trim();
      if (info.price) break;
    }
  }

  // Try to extract description
  const descSelectors = [
    '#feature-bullets', // Amazon
    '.product-description',
    'meta[name="description"]',
    'meta[property="og:description"]'
  ];

  for (const selector of descSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      info.description = element.getAttribute('content') || element.textContent.trim().substring(0, 500);
      if (info.description) break;
    }
  }

  return info;
}

// Call Claude API for sustainability analysis
async function analyzeSustainability(apiKey, productInfo) {
  const prompt = `Analyze the carbon footprint and sustainability of this product with educational details:

Product: ${productInfo.title}
Price: ${productInfo.price}
Description: ${productInfo.description}
URL: ${productInfo.url}

Please provide a COMPREHENSIVE, EDUCATIONAL analysis including:

1. CARBON FOOTPRINT ESTIMATE (in kg CO2e)
2. CATEGORY SCORES (1-10, where 10 is best/lowest impact):
   - Production Emissions
   - Materials Sourcing
   - Transportation
   - Packaging
   - End of Life

3. EDUCATIONAL INFORMATION for each category:
   - Brief explanation of what this category means
   - Specific insights about THIS product
   - Why the score is what it is
   - Tips for improvement or alternatives

4. COMPARISONS to help users understand:
   - Compare carbon footprint to everyday activities (e.g., "equivalent to driving X miles")
   - Industry average comparison if possible

5. ACTIONABLE INSIGHTS:
   - What makes this product sustainable/unsustainable
   - Better alternatives the user could consider
   - How they could offset or reduce the impact

Format as JSON:
{
  "carbonFootprint": {
    "kgCO2e": <number>,
    "description": "<brief explanation>",
    "comparison": "<comparison to everyday activity>"
  },
  "scores": {
    "production": <1-10>,
    "materials": <1-10>,
    "transportation": <1-10>,
    "packaging": <1-10>,
    "endOfLife": <1-10>
  },
  "overall": <1-10>,
  "quickSummary": "<2 sentence summary - is this sustainable or not? key takeaway>",
  "categoryDetails": {
    "production": {
      "explanation": "<what this means - 1 sentence>",
      "insight": "<specific to this product - 1-2 sentences>",
      "tips": "<actionable advice - 1 sentence>"
    },
    "materials": { "explanation": "...", "insight": "...", "tips": "..." },
    "transportation": { "explanation": "...", "insight": "...", "tips": "..." },
    "packaging": { "explanation": "...", "insight": "...", "tips": "..." },
    "endOfLife": { "explanation": "...", "insight": "...", "tips": "..." }
  },
  "recommendations": "<2-3 sentences about better alternatives or how to make more sustainable choice>"
}

Be specific, educational, and helpful. Use real data when possible, estimates when not. Make it informative!`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'API request failed');
  }

  const data = await response.json();
  let responseText = data.content[0].text;
  
  // Clean up response (remove markdown code blocks if present)
  responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  const result = JSON.parse(responseText);
  return result;
}

// Display results
function displayResults(analysis) {
  document.getElementById('results').classList.add('show');
  document.getElementById('loading').style.display = 'none';
  document.getElementById('error').style.display = 'none';
  document.getElementById('analysis').style.display = 'block';

  const scoreCircle = document.getElementById('scoreCircle');
  scoreCircle.textContent = analysis.overall;
  
  // Set color based on score
  scoreCircle.className = 'score-circle';
  if (analysis.overall <= 4) {
    scoreCircle.classList.add('low');
  } else if (analysis.overall <= 7) {
    scoreCircle.classList.add('medium');
  } else {
    scoreCircle.classList.add('high');
  }

  // Create quick summary at top
  const quickSummaryHTML = `
    <div class="quick-summary">
      <h4>📋 Quick Summary</h4>
      <p>${analysis.quickSummary || 'Analysis complete. See details below.'}</p>
    </div>
  `;

  // Create carbon footprint display
  const carbonFootprintHTML = analysis.carbonFootprint ? `
    <div style="background: white; padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #f56565;">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
        <div>
          <div style="font-size: 12px; font-weight: 600; color: #4a5568; margin-bottom: 6px;">💨 Carbon Footprint</div>
          <div style="font-size: 28px; font-weight: bold; color: #f56565;">
            ${analysis.carbonFootprint.kgCO2e} <span style="font-size: 14px; color: #718096;">kg CO₂e</span>
          </div>
        </div>
      </div>
      <div style="font-size: 11px; color: #718096; line-height: 1.5; margin-bottom: 8px;">
        ${analysis.carbonFootprint.description}
      </div>
      ${analysis.carbonFootprint.comparison ? `
        <div class="info-box" style="margin: 0;">
          <strong>💡 Real-world comparison:</strong> ${analysis.carbonFootprint.comparison}
        </div>
      ` : ''}
    </div>
  ` : '';

  // Create category sections with collapsible details
  const categories = [
    { key: 'production', icon: '🏭', label: 'Production Emissions' },
    { key: 'materials', icon: '🌍', label: 'Materials Sourcing' },
    { key: 'transportation', icon: '🚚', label: 'Transportation' },
    { key: 'packaging', icon: '📦', label: 'Packaging' },
    { key: 'endOfLife', icon: '♻️', label: 'End of Life' }
  ];

  const categoriesHTML = categories.map(cat => {
    const score = analysis.scores[cat.key];
    const details = analysis.categoryDetails ? analysis.categoryDetails[cat.key] : null;
    const scoreClass = getScoreClass(score);
    
    return `
      <div class="collapsible-section">
        <div class="section-header" data-section="${cat.key}">
          <div>
            <div style="font-size: 13px; font-weight: 600;">${cat.icon} ${cat.label}</div>
            ${details ? `<div class="category-description">${details.explanation || ''}</div>` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="font-size: 14px; font-weight: bold; color: ${scoreClass === 'high' ? '#48bb78' : scoreClass === 'medium' ? '#ed8936' : '#f56565'};">
              ${score}/10
            </div>
            <span class="arrow">▼</span>
          </div>
        </div>
        <div class="section-content" id="content-${cat.key}">
          <div class="breakdown-bar" style="margin-bottom: 12px;">
            <div class="breakdown-fill ${scoreClass}" style="width: ${score * 10}%"></div>
          </div>
          ${details ? `
            <div style="font-size: 12px; line-height: 1.6; color: #2d3748; margin-bottom: 10px;">
              <strong>About this product:</strong> ${details.insight || 'No specific insights available.'}
            </div>
            ${details.tips ? `
              <div class="tip-box" style="margin: 0;">
                <strong>💚 Tip:</strong> ${details.tips}
              </div>
            ` : ''}
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Recommendations section
  const recommendationsHTML = analysis.recommendations ? `
    <div class="collapsible-section" style="margin-top: 15px;">
      <div class="section-header" data-section="recommendations">
        <div style="font-size: 13px; font-weight: 600;">💡 Recommendations & Alternatives</div>
        <span class="arrow">▼</span>
      </div>
      <div class="section-content" id="content-recommendations">
        <div style="font-size: 12px; line-height: 1.6; color: #2d3748;">
          ${analysis.recommendations}
        </div>
      </div>
    </div>
  ` : '';

  const fullHTML = `
    ${quickSummaryHTML}
    ${carbonFootprintHTML}
    <div style="margin-bottom: 10px; font-size: 13px; font-weight: 600; color: #4a5568;">
      📊 Category Breakdown <span style="font-size: 11px; font-weight: normal; color: #718096;">(click to expand)</span>
    </div>
    ${categoriesHTML}
    ${recommendationsHTML}
  `;

  document.getElementById('analysisText').innerHTML = fullHTML;
  
  // Add event listeners to all section headers
  document.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', function() {
      const sectionId = this.getAttribute('data-section');
      toggleSection(sectionId);
    });
  });
}

// Toggle collapsible sections
function toggleSection(sectionId) {
  const content = document.getElementById('content-' + sectionId);
  const header = content.previousElementSibling;
  
  if (content.classList.contains('active')) {
    content.classList.remove('active');
    header.classList.remove('active');
  } else {
    content.classList.add('active');
    header.classList.add('active');
  }
}

// Helper function to get color class based on score
function getScoreClass(score) {
  if (score <= 4) return 'low';
  if (score <= 7) return 'medium';
  return 'high';
}

// Show loading state
function showLoading() {
  document.getElementById('results').classList.add('show');
  document.getElementById('loading').style.display = 'block';
  document.getElementById('analysis').style.display = 'none';
  document.getElementById('error').style.display = 'none';
}

// Show error
function showError(message) {
  document.getElementById('results').classList.add('show');
  document.getElementById('loading').style.display = 'none';
  document.getElementById('analysis').style.display = 'none';
  document.getElementById('error').style.display = 'block';
  document.getElementById('error').textContent = message;
}

// Save to history
async function saveToHistory(item) {
  const result = await chrome.storage.local.get(['history']);
  const history = result.history || [];
  
  // Add new item to beginning
  history.unshift(item);
  
  // Keep only last 10 items
  const trimmedHistory = history.slice(0, 10);
  
  await chrome.storage.local.set({ history: trimmedHistory });
  displayHistory(trimmedHistory);
}

// Display history
function displayHistory(history) {
  const historyList = document.getElementById('historyList');
  
  if (!history || history.length === 0) {
    historyList.innerHTML = '<div style="color: #a0aec0; font-size: 12px; text-align: center; padding: 10px;">No analysis history yet</div>';
    return;
  }

  historyList.innerHTML = history.map(item => {
    const date = new Date(item.timestamp).toLocaleDateString();
    const score = item.analysis.overall || item.analysis.score; // Support both old and new format
    const scoreClass = score <= 4 ? 'low' : score <= 7 ? 'medium' : 'high';
    
    return `
      <div class="history-item">
        <strong>${item.title.substring(0, 50)}${item.title.length > 50 ? '...' : ''}</strong>
        <span class="score-badge ${scoreClass}">${score}/10</span>
        <div style="color: #718096; font-size: 11px; margin-top: 4px;">${date}</div>
      </div>
    `;
  }).join('');
}

// Display cart
function displayCart(cart) {
  const cartStats = document.getElementById('cartStats');
  const emptyCart = document.getElementById('emptyCart');
  const cartItems = document.getElementById('cartItems');
  const cartCount = document.getElementById('cartCount');
  const cartAverage = document.getElementById('cartAverage');
  const totalCarbon = document.getElementById('totalCarbon');

  if (!cart || cart.length === 0) {
    cartStats.style.display = 'none';
    emptyCart.style.display = 'block';
    return;
  }

  // Show cart stats
  cartStats.style.display = 'block';
  emptyCart.style.display = 'none';

  // Calculate average score
  const scores = cart.map(item => item.analysis.overall || item.analysis.score || 5);
  const average = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);

  // Calculate total carbon footprint
  const carbonValues = cart.map(item => {
    if (item.analysis.carbonFootprint && item.analysis.carbonFootprint.kgCO2e) {
      return item.analysis.carbonFootprint.kgCO2e;
    }
    return 0;
  });
  const totalCarbonValue = carbonValues.reduce((a, b) => a + b, 0).toFixed(1);

  cartCount.textContent = cart.length;
  cartAverage.textContent = average;
  totalCarbon.textContent = totalCarbonValue;

  // Color code the average
  const avgNum = parseFloat(average);
  if (avgNum <= 4) {
    cartAverage.style.color = '#f56565';
  } else if (avgNum <= 7) {
    cartAverage.style.color = '#ed8936';
  } else {
    cartAverage.style.color = '#48bb78';
  }

  // Display cart items with carbon footprint
  cartItems.innerHTML = cart.map((item, index) => {
    const score = item.analysis.overall || item.analysis.score;
    const scoreClass = score <= 4 ? 'low' : score <= 7 ? 'medium' : 'high';
    const carbon = item.analysis.carbonFootprint ? item.analysis.carbonFootprint.kgCO2e : 'N/A';
    
    return `
      <div style="background: white; padding: 8px; margin-bottom: 6px; border-radius: 4px; font-size: 11px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <div style="flex: 1; overflow: hidden;">
            <div style="font-weight: 600; color: #2d3748; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${item.title.substring(0, 35)}${item.title.length > 35 ? '...' : ''}
            </div>
          </div>
          <button class="remove-cart-item" data-index="${index}" style="background: #e53e3e; color: white; border: none; padding: 4px 8px; border-radius: 3px; font-size: 10px; cursor: pointer; margin-left: 6px;">×</button>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <span class="score-badge ${scoreClass}" style="margin: 0; font-size: 10px;">${score}/10</span>
          <span style="color: #718096; font-size: 10px;">💨 ${carbon} kg CO₂e</span>
        </div>
      </div>
    `;
  }).join('');
  
  // Add event listeners to remove buttons
  document.querySelectorAll('.remove-cart-item').forEach(button => {
    button.addEventListener('click', function() {
      const index = parseInt(this.getAttribute('data-index'));
      removeFromCart(index);
    });
  });
}

// Remove item from cart
async function removeFromCart(index) {
  const result = await chrome.storage.local.get(['cart']);
  const cart = result.cart || [];
  
  cart.splice(index, 1);
  
  await chrome.storage.local.set({ cart });
  displayCart(cart);
}

// Update rewards display
function updateRewardsDisplay(points) {
  const maxPoints = 10;
  const currentPoints = Math.min(points, maxPoints);
  const percentage = (currentPoints / maxPoints) * 100;
  
  // Update progress bar
  const progressBar = document.getElementById('progressBar');
  if (progressBar) {
    progressBar.style.width = percentage + '%';
  }
  
  // Update points display
  const currentPointsEl = document.getElementById('currentPoints');
  if (currentPointsEl) {
    currentPointsEl.textContent = currentPoints;
  }
  
  // Update percentage
  const percentEl = document.getElementById('progressPercent');
  if (percentEl) {
    percentEl.textContent = Math.round(percentage);
  }
  
  // Show/hide reward unlocked section
  const rewardUnlocked = document.getElementById('rewardUnlocked');
  if (rewardUnlocked) {
    if (points >= maxPoints) {
      rewardUnlocked.style.display = 'block';
      // Generate coupon code
      const couponCode = 'ECO' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const couponCodeEl = document.getElementById('couponCodeText');
      if (couponCodeEl) {
        couponCodeEl.textContent = couponCode;
      }
    } else {
      rewardUnlocked.style.display = 'none';
    }
  }
}

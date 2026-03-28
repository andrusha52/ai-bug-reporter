// utils/api.js - AI token storage (Gemini + OpenAI)

const STORAGE_KEYS = {
  provider: 'aiProvider',   // 'gemini' | 'openai'
  gemini: 'aiApiKey',
  openai: 'openaiApiKey'
};

/**
 * Get AI config (provider + token)
 */
async function getAiConfig() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.provider, STORAGE_KEYS.gemini, STORAGE_KEYS.openai]);
    const geminiToken = result[STORAGE_KEYS.gemini] || result.aiApiKey || result.aiToken || null;
    const openaiToken = result[STORAGE_KEYS.openai] || null;
    
    let provider = result[STORAGE_KEYS.provider];
    if (!provider) {
      provider = openaiToken ? 'openai' : 'gemini';
    }
    const token = provider === 'openai' ? openaiToken : geminiToken;
    return { provider, token };
  } catch (error) {
    console.error('[API] Get AI config error:', error);
    return { provider: 'gemini', token: null };
  }
}

/**
 * Save AI config
 */
async function saveAiConfig(provider, token) {
  try {
    const data = {
      [STORAGE_KEYS.provider]: provider,
      [provider === 'openai' ? STORAGE_KEYS.openai : STORAGE_KEYS.gemini]: token
    };
    await chrome.storage.local.set(data);
    console.log('[API] AI config saved:', provider);
  } catch (error) {
    console.error('[API] Save AI config error:', error);
    throw error;
  }
}

/**
 * Save Gemini token (clears OpenAI, sets provider to gemini)
 */
async function saveGeminiToken(token) {
  await saveAiConfig('gemini', token);
  await chrome.storage.local.remove([STORAGE_KEYS.openai]);
}

/**
 * Save OpenAI token (clears Gemini, sets provider to openai)
 */
async function saveOpenaiToken(token) {
  await saveAiConfig('openai', token);
  await chrome.storage.local.remove([STORAGE_KEYS.gemini]);
}

/**
 * Clear all AI tokens
 */
async function clearAiTokens() {
  try {
    await chrome.storage.local.remove([STORAGE_KEYS.provider, STORAGE_KEYS.gemini, STORAGE_KEYS.openai, 'aiApiKey', 'aiToken']);
    console.log('[API] AI tokens cleared');
  } catch (error) {
    console.error('[API] Clear error:', error);
  }
}

// Legacy
async function getAiToken() {
  const { token } = await getAiConfig();
  return token;
}

async function getApiKey() {
  const config = await getAiConfig();
  return { apiKey: config.token, aiToken: config.token, provider: config.provider };
}

async function saveApiKey(apiKey, provider = 'gemini') {
  await saveAiConfig(provider, apiKey);
}

async function clearApiKey() {
  await clearAiTokens();
}

export {
  getAiConfig,
  saveGeminiToken,
  saveOpenaiToken,
  clearAiTokens,
  getAiToken,
  saveApiKey,
  clearApiKey,
  getApiKey
};

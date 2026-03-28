// utils/storageHelper.js
// This module provides utility functions for interacting with chrome.storage.local
// to manage extension settings like API keys and Jira credentials.

// Safely determine the global object
let globalObj;
try {
    // In service worker context, 'self' is defined
    if (typeof self !== 'undefined') {
        globalObj = self;
    }
} catch (e) {
    // Fallback for any context issues
}

// If globalObj not set, try window (for regular contexts)
if (!globalObj) {
    try {
        if (typeof window !== 'undefined') {
            globalObj = window;
        }
    } catch (e) {
        // In service worker, accessing window will throw
    }
}

// Final fallback
if (!globalObj) {
    globalObj = (function() { return this; })() || {};
}

// Create global namespace
if (!globalObj.BugReporter) globalObj.BugReporter = {};
if (!globalObj.BugReporter.utils) globalObj.BugReporter.utils = {};

globalObj.BugReporter.utils.storageHelper = (function() {
    'use strict';

    /**
     * Saves Jira credentials to chrome.storage.local.
     * @param {object} credentials - An object containing { baseUrl, email, apiToken, projectKey }.
     * @returns {Promise<void>} A promise that resolves when credentials are saved, or rejects on error.
     */
    async function saveJiraCredentials(credentials) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({
                jiraBaseUrl: credentials.baseUrl,
                jiraEmail: credentials.email,
                jiraApiToken: credentials.apiToken,
                jiraProjectKey: credentials.projectKey
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Error saving Jira credentials:', chrome.runtime.lastError.message);
                    reject(new Error(`Failed to save Jira credentials: ${chrome.runtime.lastError.message}`));
                } else {
                    console.log('Jira credentials saved successfully.');
                    resolve();
                }
            });
        });
    }

    /**
     * Retrieves Jira credentials from chrome.storage.local.
     * @returns {Promise<object|null>} A promise that resolves with an object
     * containing { baseUrl, email, apiToken, projectKey }, or null if not found/error.
     */
    async function getJiraCredentials() {
        return new Promise((resolve, reject) => {
            const keys = ['jiraBaseUrl', 'jiraEmail', 'jiraApiToken', 'jiraProjectKey'];
            chrome.storage.local.get(keys, (items) => {
                if (chrome.runtime.lastError) {
                    console.error('Error retrieving Jira credentials:', chrome.runtime.lastError.message);
                    resolve(null);
                } else {
                    if (items.jiraBaseUrl && items.jiraEmail && items.jiraApiToken && items.jiraProjectKey) {
                        resolve({
                            baseUrl: items.jiraBaseUrl,
                            email: items.jiraEmail,
                            apiToken: items.jiraApiToken,
                            projectKey: items.jiraProjectKey
                        });
                    } else {
                        console.log('Jira credentials not fully configured.');
                        resolve(null);
                    }
                }
            });
        });
    }

    /**
     * Saves the AI service API key to chrome.storage.local.
     * @param {string} apiKey - The AI service API key.
     * @returns {Promise<void>} A promise that resolves when the key is saved, or rejects on error.
     */
    async function saveAiApiKey(apiKey) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({ aiApiKey: apiKey }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Error saving AI API key:', chrome.runtime.lastError.message);
                    reject(new Error(`Failed to save AI API key: ${chrome.runtime.lastError.message}`));
                } else {
                    console.log('AI API key saved successfully.');
                    resolve();
                }
            });
        });
    }

    /**
     * Retrieves the AI service API key from chrome.storage.local.
     * @returns {Promise<string|null>} A promise that resolves with the API key string, or null if not found/error.
     */
    async function getAiApiKey() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['aiApiKey'], (items) => {
                if (chrome.runtime.lastError) {
                    console.error('Error retrieving AI API key:', chrome.runtime.lastError.message);
                    resolve(null);
                } else {
                    resolve(items.aiApiKey || null);
                }
            });
        });
    }

    /**
     * Example function to save a generic setting.
     * @param {string} key - The key under which to store the setting.
     * @param {*} value - The value to store.
     * @returns {Promise<void>}
     */
    async function saveSetting(key, value) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({ [key]: value }, () => {
                if (chrome.runtime.lastError) {
                    console.error(`Error saving setting "${key}":`, chrome.runtime.lastError.message);
                    reject(new Error(`Failed to save setting "${key}": ${chrome.runtime.lastError.message}`));
                } else {
                    console.log(`Setting "${key}" saved successfully.`);
                    resolve();
                }
            });
        });
    }

    /**
     * Example function to retrieve a generic setting.
     * @param {string} key - The key of the setting to retrieve.
     * @returns {Promise<*|null>} The value of the setting, or null.
     */
    async function getSetting(key) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get([key], (items) => {
                if (chrome.runtime.lastError) {
                    console.error(`Error retrieving setting "${key}":`, chrome.runtime.lastError.message);
                    resolve(null);
                } else {
                    resolve(items[key] || null);
                }
            });
        });
    }

    console.log('storageHelper.js loaded');

    // Public API
    return {
        saveJiraCredentials,
        getJiraCredentials,
        saveAiApiKey,
        getAiApiKey,
        saveSetting,
        getSetting
    };
})();
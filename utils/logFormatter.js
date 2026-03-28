// utils/logFormatter.js
// This module provides utility functions for formatting console and network logs
// for reports and AI prompts.

/**
 * Formats an array of console log objects into a human-readable string.
 * @param {Array<object>} consoleLogs - Array of console log objects.
 * Each object: { timestamp, level, args (array), url }
 * @returns {string} A formatted string representation of console logs.
 */
export function formatConsoleLogsForReport(consoleLogs) {
    if (!consoleLogs || consoleLogs.length === 0) {
        return "No console logs captured.\n";
    }

    let reportString = "Console Logs:\n";
    reportString += "========================================\n";
    consoleLogs.forEach(log => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const level = log.level.toUpperCase();
        // Attempt to stringify args more cleanly
        const argsString = log.args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                try {
                    return JSON.stringify(arg, null, 2); // Pretty print objects
                } catch (e) {
                    return arg.toString(); // Fallback for complex/circular objects
                }
            }
            return String(arg);
        }).join(' ');

        reportString += `[${time}] [${level}] [URL: ${log.url || 'N/A'}]\n  ${argsString}\n\n`;
    });
    reportString += "========================================\n";
    return reportString;
}

/**
 * Formats an array of network log objects (from chrome.debugger) into a human-readable string or structured summary.
 * For AI prompt, a more concise summary might be better. For report, more detail.
 * @param {Array<object>} networkLogs - Array of network log event objects.
 * @returns {string} A formatted string representation of network logs.
 */
export function formatNetworkLogsForReport(networkLogs) {
    if (!networkLogs || networkLogs.length === 0) {
        return "No network logs captured.\n";
    }

    let reportString = "Network Activity Log:\n";
    reportString += "========================================\n";

    // Group events by requestId for better readability
    const requests = {};
    networkLogs.forEach(log => {
        const id = log.requestId || log.params?.requestId;
        if (!id) return;
        
        if (!requests[id]) {
            requests[id] = [];
        }
        requests[id].push(log);
    });

    for (const requestId in requests) {
        const events = requests[requestId];
        const requestWillBeSent = events.find(e => e.type === 'Network.requestWillBeSent');
        const responseReceived = events.find(e => e.type === 'Network.responseReceived');
        const loadingFinished = events.find(e => e.type === 'Network.loadingFinished');
        const loadingFailed = events.find(e => e.type === 'Network.loadingFailed');

        if (requestWillBeSent) {
            const req = requestWillBeSent.params.request;
            const wallTime = requestWillBeSent.params.wallTime || requestWillBeSent.timestamp;
            const time = new Date(wallTime * 1000).toLocaleTimeString(); // wallTime is in seconds since epoch
            reportString += `\n[${time}] Request ID: ${requestId}\n`;
            reportString += `  URL: ${req.url}\n`;
            reportString += `  Method: ${req.method}\n`;
            if (req.postData) {
                reportString += `  Request Body (first 100 chars): ${String(req.postData).substring(0, 100)}...\n`;
            }
        }

        if (responseReceived) {
            const res = responseReceived.params.response;
            reportString += `  Status: ${res.status} ${res.statusText}\n`;
            reportString += `  MIME Type: ${res.mimeType}\n`;
            if (res.timing) {
                const timing = res.timing;
                const totalTime = timing.receiveHeadersEnd - timing.requestTime; // Approximation
                reportString += `  Timing: Connect Start: ${timing.connectStart}, DNS Start: ${timing.dnsStart}, Request Time: ${timing.requestTime}, Receive Headers End: ${timing.receiveHeadersEnd} (Approx. Total: ${totalTime ? totalTime.toFixed(2) : 'N/A'} ms)\n`;
            }
        }

        if (loadingFinished) {
            reportString += `  Finished: Encoded Data Length: ${loadingFinished.params.encodedDataLength} bytes\n`;
        }

        if (loadingFailed) {
            reportString += `  Failed: ${loadingFailed.params.errorText} (Canceled: ${loadingFailed.params.canceled})\n`;
        }
        reportString += `----------------------------------------\n`;
    }
    reportString += "========================================\n";
    return reportString;
}


/**
 * Formats console and network logs, along with user notes, into a single text prompt for an AI service.
 * This function aims for conciseness while retaining key information.
 * @param {Array<object>} consoleLogs
 * @param {Array<object>} networkLogs
 * @param {object} userNote - Object containing { summary: string, description: string }
 * @returns {string} A combined text prompt.
 */
export function formatLogsForAiPrompt(consoleLogs, networkLogs, userNote) {
    let prompt = "Analyze the following browser activity to generate a bug report summary and steps to reproduce.\n\n";

    prompt += "USER'S INITIAL NOTE:\n";
    prompt += `Summary: ${userNote.summary || 'Not provided.'}\n`;
    prompt += `Description: ${userNote.description || 'Not provided.'}\n\n`;
    prompt += "----------------------------------------\n\n";

    // Console Logs (Summarized for AI)
    if (consoleLogs && consoleLogs.length > 0) {
        prompt += "CONSOLE LOGS (Key Entries):\n";
        // Limit to a certain number of recent/error logs for brevity
        const maxConsoleEntries = 20;
        const filteredConsoleLogs = consoleLogs
            .filter(log => log.level === 'error' || log.level === 'warn') // Prioritize errors/warnings
            .slice(-maxConsoleEntries); // Get the last N entries

        if (filteredConsoleLogs.length === 0 && consoleLogs.length > 0) {
            // If no errors/warnings, take the last few general logs
            consoleLogs.slice(-maxConsoleEntries).forEach(log => {
                prompt += `[${log.level.toUpperCase()}] ${log.args.join(' ')}\n`;
            });
        } else {
            filteredConsoleLogs.forEach(log => {
                prompt += `[${log.level.toUpperCase()}] ${log.args.join(' ')}\n`;
            });
        }
        if (consoleLogs.length > maxConsoleEntries) {
            prompt += `(... and ${consoleLogs.length - maxConsoleEntries} more console entries)\n`;
        }
        prompt += "\n";
    } else {
        prompt += "CONSOLE LOGS: No significant logs captured or provided.\n\n";
    }
    prompt += "----------------------------------------\n\n";

    // Network Logs (Summarized for AI)
    if (networkLogs && networkLogs.length > 0) {
        prompt += "NETWORK ACTIVITY (Key Requests/Failures):\n";
        const maxNetworkEntries = 15;
        let networkEntryCount = 0;

        const requests = {};
        networkLogs.forEach(log => {
            const id = log.requestId || log.params?.requestId;
            if (!id) return;
            if (!requests[id]) requests[id] = {};
            requests[id][log.type] = log;
        });

        for (const requestId in requests) {
            if (networkEntryCount >= maxNetworkEntries) {
                prompt += `(... and more network requests)\n`;
                break;
            }
            const reqData = requests[requestId]['Network.requestWillBeSent'];
            const resData = requests[requestId]['Network.responseReceived'];
            const failData = requests[requestId]['Network.loadingFailed'];

            if (reqData) {
                const req = reqData.params.request;
                let entry = `${req.method} ${req.url.substring(0,100)}${req.url.length > 100 ? '...' : ''}`;
                if (resData) {
                    entry += ` -> ${resData.params.response.status} ${resData.params.response.statusText}`;
                }
                if (failData) {
                    entry += ` -> FAILED: ${failData.params.errorText}`;
                }
                prompt += `${entry}\n`;
                networkEntryCount++;
            }
        }
        prompt += "\n";
    } else {
        prompt += "NETWORK ACTIVITY: No significant network activity captured or provided.\n\n";
    }
    prompt += "----------------------------------------\n\n";

    prompt += "Based on the above, please generate:\n";
    prompt += "1. A concise bug summary (1-2 sentences).\n";
    prompt += "2. Numbered steps to reproduce the bug.\n";
    prompt += "Focus on clarity and actionability for a developer.\n";

    return prompt;
}

console.log('logFormatter.js loaded');
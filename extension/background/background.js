// Background service worker
chrome.runtime.onInstalled.addListener(() => {
    console.log('Bias Detector extension installed');
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'analyze') {
        // Handle analysis requests if needed
        sendResponse({ success: true });
    }
    return true;
});

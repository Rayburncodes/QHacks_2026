document.getElementById('close-panel').addEventListener('click', () => {
    // Logic to close panel (e.g. communicate with content script)
    window.parent.postMessage({ type: 'CLOSE_PANEL' }, '*');
});

// Centralized Configuration for Accountability Tracker
const CONFIG = {
    // Set this to your GitHub Gist ID for centralized data storage
    // Leave empty for local storage only
    CENTRAL_GIST_ID: 'b5a7d32dc701472f020d199ee30de815',
    
    // Optional: GitHub token for better API limits (recommended)
    // Users can also provide their own token through the UI
    GITHUB_TOKEN: '',
    
    // Auto-load centralized data on startup
    AUTO_LOAD_CENTRAL_DATA: true,
    
    // Auto-save to central storage (requires token)
    AUTO_SAVE_TO_CENTRAL: true,
    
    // Sync interval in minutes (0 to disable)
    SYNC_INTERVAL_MINUTES: 5,
    
    // Application settings
    APP_NAME: 'Accountability Tracker',
    VERSION: '2.1',
    
    // Default users (can be modified)
    DEFAULT_USERS: {
        person1: { name: 'Alex', id: 'person1' },
        person2: { name: 'Jordan', id: 'person2' }
    }
};

// Instructions for setup:
// 1. Create a GitHub Gist with your initial data
// 2. Set CENTRAL_GIST_ID to the Gist ID (from the URL)
// 3. Optionally set GITHUB_TOKEN for better reliability
// 4. All users will now share the same data!
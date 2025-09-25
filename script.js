// Global variables
let currentPerson = 'person1';
let currentView = 'table';
let currentTaskId = 0;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

// Initialize with EMPTY data - pure cloud approach
let users = {};
let nextUserId = 1;

// GitHub Gist integration for pure cloud storage
let currentGistId = CONFIG.CENTRAL_GIST_ID || null;
const GIST_API_URL = 'https://api.github.com/gists';

// Pure cloud data flag - no localStorage fallback
let usingCentralData = !!CONFIG.CENTRAL_GIST_ID;

// Enhanced session-based token storage with better validation
let sessionToken = null;
let tokenExpiry = null;
const TOKEN_SESSION_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds

// Loading state management with better operation tracking
let isCloudOperationInProgress = false;
let operationType = null; // Track what type of operation is in progress

// Initialize with EMPTY task data - pure cloud approach  
let tasksData = {};

// Initialize the application - pure cloud approach
document.addEventListener('DOMContentLoaded', async function() {
    if (usingCentralData && currentGistId) {
        showMessage('Loading data from cloud...', 'info');
        try {
            await loadData();
            showMessage('✅ Connected to cloud storage!', 'success');
            
            // Ensure we have at least default users if cloud is empty
            if (!users || Object.keys(users).length === 0) {
                console.log('Cloud data is empty, initializing with default users');
                users = CONFIG.DEFAULT_USERS;
                nextUserId = Object.keys(users).length + 1;
                // Initialize empty task data for each user
                Object.keys(users).forEach(userId => {
                    if (!tasksData[userId]) {
                        tasksData[userId] = [];
                    }
                });
                // Save the initial setup to cloud
                await saveData();
            }
        } catch (error) {
            console.error('Failed to load from cloud:', error);
            showMessage('⚠️ Cloud unavailable - initializing with default data', 'warning');
            // Initialize with defaults if cloud fails
            users = CONFIG.DEFAULT_USERS;
            nextUserId = Object.keys(users).length + 1;
            tasksData = {};
            Object.keys(users).forEach(userId => {
                tasksData[userId] = [];
            });
        }
    } else {
        console.log('No cloud storage configured - using defaults');
        users = CONFIG.DEFAULT_USERS;
        nextUserId = Object.keys(users).length + 1;
        tasksData = {};
        Object.keys(users).forEach(userId => {
            tasksData[userId] = [];
        });
    }
    
    // Set currentPerson to first available user
    currentPerson = Object.keys(users)[0] || 'person1';
    
    currentTaskId = Math.max(...Object.values(tasksData).flat().map(t => t.id)) || 0;
    refreshAllViews();
    updateTokenStatus();
    
    // Set up form submissions
    document.getElementById('task-form').addEventListener('submit', handleTaskSubmit);
    document.getElementById('add-user-form').addEventListener('submit', handleAddUser);
    
    // Set up auto-sync if configured
    if (CONFIG.SYNC_INTERVAL_MINUTES > 0 && usingCentralData) {
        setInterval(syncWithCentralData, CONFIG.SYNC_INTERVAL_MINUTES * 60 * 1000);
    }
});

// Pure cloud-based data loading - no localStorage
async function loadData() {
    if (!currentGistId) {
        console.log('No cloud storage configured, using default data');
        return;
    }
    
    try {
        await loadCentralData();
        console.log('Data loaded from cloud successfully');
    } catch (error) {
        console.error('Failed to load from cloud, using default data:', error);
        showMessage('⚠️ Using default data - cloud storage unavailable', 'warning');
    }
}

// Centralized data functions
async function loadCentralData() {
    if (!currentGistId) throw new Error('No central Gist ID configured');
    
    const response = await fetch(`${GIST_API_URL}/${currentGistId}`);
    if (!response.ok) throw new Error('Failed to fetch central data');
    
    const gist = await response.json();
    const fileContent = gist.files['accountability-data.json'];
    
    if (fileContent) {
        let centralData = JSON.parse(fileContent.content);
        
        // Load central data - completely replace local data
        if (centralData.users) {
            users = centralData.users;
            console.log('Loaded users from cloud:', Object.keys(users));
        }
        if (centralData.tasksData) {
            tasksData = centralData.tasksData;
            const totalTasks = Object.values(tasksData).reduce((sum, tasks) => sum + (tasks?.length || 0), 0);
            console.log('Loaded tasks from cloud - Total tasks:', totalTasks);
        }
        if (centralData.nextUserId) nextUserId = centralData.nextUserId;
        if (centralData.currentTaskId) currentTaskId = centralData.currentTaskId;
        
        // Validate data integrity
        Object.keys(users).forEach(userId => {
            if (!tasksData[userId]) {
                console.log(`Initializing empty tasks for user: ${userId}`);
                tasksData[userId] = [];
            }
        });
        
        console.log('Cloud data loaded successfully:', { 
            userCount: Object.keys(users).length, 
            totalTasks: Object.values(tasksData).reduce((sum, tasks) => sum + (tasks?.length || 0), 0)
        });
    } else {
        throw new Error('No data found in central storage');
    }
}

// Secure token prompt function
async function promptForToken() {
    return new Promise((resolve) => {
        // Create modal for token input
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2><i class="fas fa-key"></i> GitHub Token Required</h2>
                </div>
                <div class="modal-body">
                    <p>To save your data to the cloud, please provide your GitHub Personal Access Token.</p>
                    <div class="form-group">
                        <label for="secure-token-input">GitHub Token:</label>
                        <input type="password" id="secure-token-input" placeholder="Enter your GitHub token" style="width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; margin-top: 8px;">
                    </div>
                    <div style="margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #3b82f6;">
                        <h4 style="margin: 0 0 8px 0; color: #1e40af;">How to get a token:</h4>
                        <ol style="margin: 0; padding-left: 20px; color: #64748b;">
                            <li>Go to <strong>github.com/settings/tokens</strong></li>
                            <li>Click "Generate new token (classic)"</li>
                            <li>Check the "gist" permission</li>
                            <li>Copy and paste the token here</li>
                        </ol>
                        <p style="margin: 8px 0 0 0; color: #64748b; font-size: 14px;"><strong>Note:</strong> Your token is used only for this save operation and is not stored anywhere.</p>
                    </div>
                    <div class="form-actions" style="margin-top: 20px;">
                        <button type="button" class="btn btn-secondary" id="cancel-token-btn">Cancel</button>
                        <button type="button" class="btn btn-primary" id="save-token-btn">Save to Cloud</button>
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to page
        document.body.appendChild(modal);
        
        // Focus on input
        setTimeout(() => {
            document.getElementById('secure-token-input').focus();
        }, 100);
        
        // Handle cancel button
        document.getElementById('cancel-token-btn').addEventListener('click', () => {
            modal.remove();
            resolve(null);
        });
        
        // Handle save button
        document.getElementById('save-token-btn').addEventListener('click', () => {
            const token = document.getElementById('secure-token-input').value.trim();
            modal.remove();
            resolve(token || null);
        });
        
        // Handle Enter key
        document.getElementById('secure-token-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const token = e.target.value.trim();
                modal.remove();
                resolve(token || null);
            }
        });
        
        // Handle modal close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve(null);
            }
        });
    });
}

// Enhanced session token management with better caching
async function getSessionToken() {
    // Check if we have a valid cached session token
    if (sessionToken && tokenExpiry && Date.now() < tokenExpiry) {
        console.log('Using cached session token (expires in', Math.ceil((tokenExpiry - Date.now()) / (1000 * 60)), 'minutes)');
        return sessionToken;
    }
    
    // Check for configured token first
    if (CONFIG.GITHUB_TOKEN) {
        console.log('Using configured token from CONFIG');
        return CONFIG.GITHUB_TOKEN;
    }
    
    // Clear any expired token
    if (sessionToken && tokenExpiry && Date.now() >= tokenExpiry) {
        console.log('Session token expired, clearing cache...');
        sessionToken = null;
        tokenExpiry = null;
        updateTokenStatus();
    }
    
    // Prevent multiple concurrent token prompts
    if (isCloudOperationInProgress && operationType === 'token-prompt') {
        console.log('Token prompt already in progress, waiting...');
        return null;
    }
    
    // No valid token available, prompt user
    console.log('No valid session token, prompting user...');
    operationType = 'token-prompt';
    isCloudOperationInProgress = true;
    
    try {
        const token = await promptForToken();
        
        if (token && token.trim()) {
            // Cache the valid token for the session
            sessionToken = token.trim();
            tokenExpiry = Date.now() + TOKEN_SESSION_DURATION;
            console.log('New token cached for 30-minute session');
            showMessage('🔑 Token saved for this session - no more prompts for 30 minutes!', 'success');
            updateTokenStatus();
        }
        
        return sessionToken;
    } finally {
        isCloudOperationInProgress = false;
        operationType = null;
    }
}

// Update token status indicator
function updateTokenStatus() {
    const statusCard = document.getElementById('cloud-status-card');
    if (statusCard) {
        if (sessionToken && tokenExpiry && Date.now() < tokenExpiry) {
            const remainingTime = Math.ceil((tokenExpiry - Date.now()) / (1000 * 60));
            statusCard.innerHTML = `
                <div class="status-indicator">
                    <div class="status-dot active"></div>
                    <div class="status-text">
                        <strong>🔑 Token Active</strong>
                        <small>${remainingTime} min remaining</small>
                    </div>
                </div>
            `;
        } else if (usingCentralData) {
            statusCard.innerHTML = `
                <div class="status-indicator">
                    <div class="status-dot warning"></div>
                    <div class="status-text">
                        <strong>⚠️ Token Needed</strong>
                        <small>Will prompt on next save</small>
                    </div>
                </div>
            `;
        }
    }
}

// Clear session token manually
function clearSessionToken() {
    sessionToken = null;
    tokenExpiry = null;
    updateTokenStatus();
    showMessage('🔓 Session token cleared', 'info');
}

// Robust cloud save with proper error handling
async function saveData() {
    if (!usingCentralData || !currentGistId) {
        console.log('No cloud storage configured - data only in memory');
        return false;
    }
    
    // Show saving state
    const statusElement = document.getElementById('cloud-status');
    if (statusElement) {
        statusElement.textContent = '💾';
        statusElement.parentElement.title = 'Saving to cloud...';
    }
    
    try {
        console.log('Starting cloud save operation...');
        const success = await saveCentralDataWithToken();
        
        if (success) {
            console.log('✅ Data successfully saved to cloud');
            if (statusElement) {
                statusElement.textContent = '☁️';
                statusElement.parentElement.title = 'Connected to cloud storage';
            }
            return true;
        } else {
            console.log('❌ Cloud save failed');
            if (statusElement) {
                statusElement.textContent = '⚠️';
                statusElement.parentElement.title = 'Cloud save failed';
            }
            return false;
        }
    } catch (error) {
        console.error('Save operation failed:', error);
        showMessage('❌ Failed to save data to cloud: ' + error.message, 'error');
        if (statusElement) {
            statusElement.textContent = '❌';
            statusElement.parentElement.title = 'Cloud save error';
        }
        return false;
    }
}

// Direct cloud save with robust error handling
async function saveCentralDataWithToken() {
    if (!currentGistId) {
        console.error('No central Gist ID configured');
        showMessage('❌ Cloud storage not configured', 'error');
        return false;
    }
    
    // Prevent concurrent operations (except token prompts)
    if (isCloudOperationInProgress && operationType !== 'token-prompt') {
        console.log('Another cloud operation is in progress, waiting...');
        // Wait a bit and retry
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (isCloudOperationInProgress) {
            console.log('Cloud operation still in progress, aborting');
            return false;
        }
    }
    
    isCloudOperationInProgress = true;
    operationType = 'save';
    
    try {
        console.log('Getting session token for cloud save...');
        const token = await getSessionToken();
        if (!token) {
            showMessage('❌ GitHub token required to save to cloud', 'error');
            return false;
        }
        
        console.log('Attempting cloud save with token...');
        const result = await saveCentralData(token);
        
        if (result) {
            console.log('✅ Cloud save completed successfully');
            
            // Force reload from cloud to ensure consistency
            setTimeout(async () => {
                try {
                    console.log('Reloading from cloud to verify save...');
                    await loadCentralData();
                    refreshAllViews();
                    console.log('✅ Data consistency verified');
                } catch (error) {
                    console.error('Failed to verify save by reloading:', error);
                    showMessage('⚠️ Save completed but verification failed', 'warning');
                }
            }, 500);
        } else {
            console.log('❌ Cloud save failed');
        }
        
        return result;
    } catch (error) {
        console.error('Error in saveCentralDataWithToken:', error);
        showMessage('❌ Cloud save error: ' + error.message, 'error');
        return false;
    } finally {
        isCloudOperationInProgress = false;
        operationType = null;
    }
}

// Enhanced cloud save with better error handling and validation
async function saveCentralData(userToken = null) {
    if (!currentGistId) {
        console.error('No central Gist ID configured');
        return false;
    }
    
    // Get token from session cache, config, or user input
    let token = userToken || CONFIG.GITHUB_TOKEN;
    
    if (!token) {
        console.log('No token available, prompting user...');
        token = await promptForToken();
        if (!token) {
            showMessage('❌ GitHub token required to save to cloud', 'error');
            return false;
        }
        console.log('Token provided by user');
    }
    
    // Validate that we have data to save
    if (!users || Object.keys(users).length === 0) {
        showMessage('❌ No user data to save', 'error');
        return false;
    }
    
    try {
        const data = {
            users: users,
            tasksData: tasksData,
            nextUserId: nextUserId,
            currentTaskId: currentTaskId,
            lastUpdated: new Date().toISOString(),
            version: CONFIG.VERSION || '2.0'
        };
    
        const gistData = {
            files: {
                "accountability-data.json": {
                    content: JSON.stringify(data, null, 2)
                }
            }
        };
    
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${token}`
        };
    
        console.log('Saving to Gist:', currentGistId, '- Users:', Object.keys(users).length, '- Total tasks:', Object.values(tasksData).reduce((sum, tasks) => sum + tasks.length, 0));
        
        const response = await fetch(`${GIST_API_URL}/${currentGistId}`, {
            method: 'PATCH',
            headers: headers,
            body: JSON.stringify(gistData)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Data saved to cloud successfully at:', new Date().toLocaleTimeString());
            console.log('Cloud data summary:', {
                users: Object.keys(data.users).length,
                totalTasks: Object.values(data.tasksData).reduce((sum, tasks) => sum + tasks.length, 0),
                lastUpdated: data.lastUpdated
            });
            
            return true;
        } else {
            const errorText = await response.text();
            console.error('❌ Failed to save to cloud:', response.status, response.statusText);
            console.error('Error details:', errorText);
            
            // Provide specific error messages
            if (response.status === 401) {
                showMessage('❌ Invalid GitHub token - please check your token', 'error');
                // Clear the invalid session token
                sessionToken = null;
                tokenExpiry = null;
                updateTokenStatus();
            } else if (response.status === 404) {
                showMessage('❌ Gist not found - please check the Gist ID', 'error');
            } else {
                showMessage('❌ Failed to save to cloud - please try again', 'error');
            }
            
            return false;
        }
    } catch (error) {
        console.error('❌ Error saving to cloud:', error);
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showMessage('❌ Network error - check your internet connection', 'error');
        } else {
            showMessage('❌ Unexpected error saving to cloud', 'error');
        }
        
        return false;
    }
}

async function syncWithCentralData() {
    if (usingCentralData) {
        try {
            await loadCentralData();
            updateStats();
            renderTasks();
            renderKanbanBoard();
            renderCalendar();
            console.log('Auto-synced with central data');
        } catch (error) {
            console.error('Auto-sync failed:', error);
        }
    }
}

// Refresh all UI views after data changes with better error handling
function refreshAllViews() {
    try {
        console.log('Refreshing all views...');
        
        renderPersonButtons();
        updateStats();
        renderTasks();
        renderKanbanBoard();
        renderCalendar();
        
        // Only refresh users list if the modal is open
        const manageUsersModal = document.getElementById('manage-users-modal');
        if (manageUsersModal && manageUsersModal.style.display === 'block') {
            renderUsersList();
        }
        
        console.log('All views refreshed successfully');
    } catch (error) {
        console.error('Error refreshing views:', error);
        showMessage('⚠️ UI refresh error - please reload the page', 'warning');
    }
}

// Render person buttons dynamically with validation
function renderPersonButtons() {
    const container = document.getElementById('person-buttons');
    if (!container) {
        console.error('Person buttons container not found');
        return;
    }
    
    container.innerHTML = '';
    
    if (!users || Object.keys(users).length === 0) {
        console.warn('No users available to render');
        return;
    }
    
    const userList = Object.values(users);
    const currentUserExists = users[currentPerson];
    
    userList.forEach((user, index) => {
        const button = document.createElement('button');
        const isActive = currentUserExists && user.id === currentPerson;
        button.className = `person-btn ${isActive ? 'active' : ''}`;
        button.onclick = () => switchPerson(user.id);
        button.innerHTML = `<i class="fas fa-user"></i> ${user.name}'s Tracker`;
        container.appendChild(button);
    });
    
    console.log(`Rendered ${userList.length} person buttons, active: ${currentPerson}`);
}

// Person switching with validation
function switchPerson(person) {
    if (!users[person]) {
        console.error('User not found:', person);
        return;
    }
    
    currentPerson = person;
    console.log('Switched to person:', person);
    
    // Update button states - find the clicked button properly
    document.querySelectorAll('.person-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.includes(users[person].name)) {
            btn.classList.add('active');
        }
    });
    
    // Update display
    refreshAllViews();
}

// View switching
function switchView(view) {
    currentView = view;
    
    // Update button states
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Update view visibility
    document.querySelectorAll('.view-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`${view}-view`).classList.add('active');
    
    if (view === 'calendar') {
        renderCalendar();
    }
}

// Update statistics with proper validation
function updateStats() {
    // Ensure currentPerson exists and has data
    if (!currentPerson || !users[currentPerson]) {
        console.warn('Current person not found, switching to first available user');
        currentPerson = Object.keys(users)[0];
        if (!currentPerson) {
            console.error('No users available');
            document.getElementById('total-tasks').textContent = 0;
            document.getElementById('completed-tasks').textContent = 0;
            document.getElementById('in-progress-tasks').textContent = 0;
            document.getElementById('progress-percentage').textContent = '0%';
            return;
        }
    }
    
    // Get tasks for current person, ensuring it's an array
    const tasks = tasksData[currentPerson] || [];
    if (!Array.isArray(tasks)) {
        console.error('Tasks data is not an array for user:', currentPerson);
        tasksData[currentPerson] = [];
    }
    
    const total = tasks.length;
    const completed = tasks.filter(task => task.status === 'completed').length;
    const inProgress = tasks.filter(task => task.status === 'in-progress').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    console.log(`Stats for ${currentPerson}:`, { total, completed, inProgress, percentage });
    
    document.getElementById('total-tasks').textContent = total;
    document.getElementById('completed-tasks').textContent = completed;
    document.getElementById('in-progress-tasks').textContent = inProgress;
    document.getElementById('progress-percentage').textContent = percentage + '%';
    
    // Update cloud status and token status
    updateCloudStatus();
    updateTokenStatus();
}

function updateCloudStatus() {
    const statusCard = document.getElementById('cloud-status-card');
    const statusIndicator = document.getElementById('cloud-status');
    
    if (currentGistId) {
        statusCard.style.display = 'block';
        statusIndicator.textContent = '☁️';
        statusCard.title = 'Connected to cloud storage';
    } else {
        statusCard.style.display = 'none';
    }
}

// Render tasks in table view
function renderTasks() {
    const tbody = document.getElementById('tasks-tbody');
    const tasks = getFilteredTasks();
    
    tbody.innerHTML = '';
    
    tasks.forEach(task => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div style="font-weight: 600; color: #2d3748; margin-bottom: 4px;">${task.name}</div>
            </td>
            <td>
                <span class="priority-tag priority-${task.priority}">
                    <i class="fas fa-circle"></i>
                    ${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                </span>
            </td>
            <td>
                <span class="status-tag status-${task.status.replace('-', '-')}">
                    <i class="fas ${getStatusIcon(task.status)}"></i>
                    ${task.status.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                </span>
            </td>
            <td>${task.deadline ? formatDate(task.deadline) : 'No deadline'}</td>
            <td>
                <div style="max-width: 300px; font-size: 13px; color: #64748b; line-height: 1.4;">
                    ${task.update}
                </div>
            </td>
            <td>${formatDate(task.dateLogged)}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn btn-edit" onclick="editTask(${task.id})">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="action-btn btn-delete" onclick="deleteTask(${task.id})">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Render Kanban board
function renderKanbanBoard() {
    const tasks = getFilteredTasks();
    const statusCounts = {
        'not-started': 0,
        'in-progress': 0,
        'completed': 0
    };
    
    // Clear existing tasks
    ['not-started', 'in-progress', 'completed'].forEach(status => {
        document.getElementById(`${status}-tasks`).innerHTML = '';
    });
    
    tasks.forEach(task => {
        statusCounts[task.status]++;
        
        const taskElement = document.createElement('div');
        taskElement.className = 'kanban-task';
        taskElement.innerHTML = `
            <div class="kanban-task-title">${task.name}</div>
            <div class="kanban-task-meta">
                <span class="priority-tag priority-${task.priority}">
                    <i class="fas fa-circle"></i>
                    ${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                </span>
                ${task.deadline ? `<small style="color: #64748b;">${formatDate(task.deadline)}</small>` : ''}
            </div>
            <div class="kanban-task-update">${task.update}</div>
            <div class="kanban-task-date">Updated: ${formatDate(task.dateLogged)}</div>
        `;
        
        taskElement.addEventListener('click', () => editTask(task.id));
        document.getElementById(`${task.status}-tasks`).appendChild(taskElement);
    });
    
    // Update counts
    Object.keys(statusCounts).forEach(status => {
        document.getElementById(`${status.replace('-', '-')}-count`).textContent = statusCounts[status];
    });
}

// Render calendar
function renderCalendar() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    
    document.getElementById('calendar-month').textContent = `${monthNames[currentMonth]} ${currentYear}`;
    
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const today = new Date();
    
    const calendar = document.getElementById('calendar-grid');
    calendar.innerHTML = '';
    
    // Add day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        const header = document.createElement('div');
        header.style.cssText = 'background: #667eea; color: white; padding: 12px; font-weight: 600; text-align: center;';
        header.textContent = day;
        calendar.appendChild(header);
    });
    
    // Add empty cells for days before month starts
    for (let i = 0; i < firstDay.getDay(); i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day other-month';
        calendar.appendChild(emptyDay);
    }
    
    // Add days of the month
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        
        const isToday = today.getDate() === day && today.getMonth() === currentMonth && today.getFullYear() === currentYear;
        if (isToday) {
            dayElement.classList.add('today');
        }
        
        dayElement.innerHTML = `<div class="calendar-day-number">${day}</div>`;
        
        // Add tasks for this day
        const dayTasks = getTasksForDate(currentYear, currentMonth, day);
        dayTasks.forEach(task => {
            const taskElement = document.createElement('div');
            taskElement.className = 'calendar-task';
            taskElement.textContent = task.name;
            taskElement.title = `${task.name} - ${task.status}`;
            dayElement.appendChild(taskElement);
        });
        
        calendar.appendChild(dayElement);
    }
}

// Get tasks for a specific date
function getTasksForDate(year, month, day) {
    const tasks = tasksData[currentPerson] || [];
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return tasks.filter(task => task.deadline === dateStr);
}

// Navigate calendar
function navigateMonth(direction) {
    currentMonth += direction;
    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    } else if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }
    renderCalendar();
}

// Get filtered tasks with validation
function getFilteredTasks() {
    if (!currentPerson || !users[currentPerson] || !tasksData[currentPerson]) {
        console.warn('No tasks available for current person:', currentPerson);
        return [];
    }
    
    let tasks = tasksData[currentPerson] || [];
    
    // Ensure tasks is an array
    if (!Array.isArray(tasks)) {
        console.error('Tasks data is not an array, resetting to empty array');
        tasksData[currentPerson] = [];
        return [];
    }
    
    const priorityFilter = document.getElementById('priority-filter')?.value || 'all';
    const statusFilter = document.getElementById('status-filter')?.value || 'all';
    
    if (priorityFilter !== 'all') {
        tasks = tasks.filter(task => task.priority === priorityFilter);
    }
    
    if (statusFilter !== 'all') {
        tasks = tasks.filter(task => task.status === statusFilter);
    }
    
    return tasks;
}

// Filter tasks
function filterTasks() {
    renderTasks();
    renderKanbanBoard();
}

// Add new task
function addTask() {
    document.getElementById('modal-title').textContent = 'Add New Task';
    document.getElementById('task-form').reset();
    document.getElementById('task-form').dataset.mode = 'add';
    document.getElementById('task-modal').style.display = 'block';
}

// Edit existing task
function editTask(taskId) {
    const task = tasksData[currentPerson].find(t => t.id === taskId);
    if (!task) return;
    
    document.getElementById('modal-title').textContent = 'Edit Task';
    document.getElementById('task-name').value = task.name;
    document.getElementById('task-priority').value = task.priority;
    document.getElementById('task-status').value = task.status;
    document.getElementById('task-deadline').value = task.deadline || '';
    document.getElementById('task-update').value = task.update;
    
    document.getElementById('task-form').dataset.mode = 'edit';
    document.getElementById('task-form').dataset.taskId = taskId;
    document.getElementById('task-modal').style.display = 'block';
}

// Delete task with robust cloud sync
async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) {
        return;
    }
    
    // Show loading state
    showMessage('🗑️ Deleting task...', 'info');
    
    // Keep backup for rollback
    const taskIndex = tasksData[currentPerson].findIndex(task => task.id === taskId);
    if (taskIndex === -1) {
        showMessage('❌ Task not found', 'error');
        return;
    }
    
    const taskBackup = { ...tasksData[currentPerson][taskIndex] };
    
    try {
        // Remove task from data
        tasksData[currentPerson] = tasksData[currentPerson].filter(task => task.id !== taskId);
        
        // Try to save to cloud BEFORE updating UI
        if (usingCentralData) {
            const success = await saveData();
            if (!success) {
                // Rollback the deletion if cloud save failed
                tasksData[currentPerson].splice(taskIndex, 0, taskBackup);
                showMessage('❌ Failed to delete task from cloud - deletion cancelled', 'error');
                return;
            }
        }
        
        // Only update UI after successful cloud save (or if not using cloud)
        refreshAllViews();
        showMessage('✅ Task deleted successfully and saved to cloud!', 'success');
        
    } catch (error) {
        console.error('Error during task deletion:', error);
        // Rollback on error
        tasksData[currentPerson].splice(taskIndex, 0, taskBackup);
        refreshAllViews();
        showMessage('❌ Error deleting task - deletion cancelled', 'error');
    }
}

// Handle form submission - robust cloud operations
async function handleTaskSubmit(e) {
    e.preventDefault();
    
    const taskData = {
        name: document.getElementById('task-name').value,
        priority: document.getElementById('task-priority').value,
        status: document.getElementById('task-status').value,
        deadline: document.getElementById('task-deadline').value || null,
        update: document.getElementById('task-update').value,
        dateLogged: new Date().toISOString().split('T')[0]
    };
    
    const mode = e.target.dataset.mode;
    let backupData = null;
    
    try {
        showMessage('💾 Saving task...', 'info');
        
        if (mode === 'add') {
            taskData.id = ++currentTaskId;
            if (!tasksData[currentPerson]) {
                tasksData[currentPerson] = [];
            }
            tasksData[currentPerson].push(taskData);
            
        } else if (mode === 'edit') {
            const taskId = parseInt(e.target.dataset.taskId);
            const taskIndex = tasksData[currentPerson].findIndex(t => t.id === taskId);
            if (taskIndex !== -1) {
                // Keep backup for rollback
                backupData = { ...tasksData[currentPerson][taskIndex] };
                tasksData[currentPerson][taskIndex] = { ...tasksData[currentPerson][taskIndex], ...taskData };
            }
        }
        
        // Try to save to cloud BEFORE closing modal and updating UI
        if (usingCentralData) {
            const success = await saveData();
            if (!success) {
                // Rollback the changes
                if (mode === 'add') {
                    tasksData[currentPerson].pop();
                    currentTaskId--;
                } else if (mode === 'edit' && backupData) {
                    const taskId = parseInt(e.target.dataset.taskId);
                    const taskIndex = tasksData[currentPerson].findIndex(t => t.id === taskId);
                    if (taskIndex !== -1) {
                        tasksData[currentPerson][taskIndex] = backupData;
                    }
                }
                showMessage('❌ Failed to save task to cloud - changes cancelled', 'error');
                return;
            }
        }
        
        // Only close modal and update UI after successful save
        closeModal();
        refreshAllViews();
        
        const action = mode === 'add' ? 'added' : 'updated';
        showMessage(`✅ Task ${action} successfully and saved to cloud!`, 'success');
        
    } catch (error) {
        console.error('Error during task submit:', error);
        
        // Rollback on error
        if (mode === 'add') {
            tasksData[currentPerson].pop();
            currentTaskId--;
        } else if (mode === 'edit' && backupData) {
            const taskId = parseInt(e.target.dataset.taskId);
            const taskIndex = tasksData[currentPerson].findIndex(t => t.id === taskId);
            if (taskIndex !== -1) {
                tasksData[currentPerson][taskIndex] = backupData;
            }
        }
        
        refreshAllViews();
        showMessage('❌ Error saving task - changes cancelled', 'error');
    }
}

// User Management Functions
function showAddUserModal() {
    document.getElementById('add-user-modal').style.display = 'block';
}

function closeAddUserModal() {
    document.getElementById('add-user-modal').style.display = 'none';
    document.getElementById('add-user-form').reset();
}

async function handleAddUser(e) {
    e.preventDefault();
    const userName = document.getElementById('user-name').value.trim();
    
    if (!userName) {
        showMessage('Please enter a user name', 'error');
        return;
    }
    
    // Show loading state
    showMessage('👤 Adding user...', 'info');
    
    const userId = `person${nextUserId}`;
    const newUser = { name: userName, id: userId };
    
    try {
        // Add user to data structures
        users[userId] = newUser;
        tasksData[userId] = [];
        nextUserId++;
        
        // Try to save to cloud BEFORE updating UI
        if (usingCentralData) {
            const success = await saveData();
            if (!success) {
                // Rollback the addition if cloud save failed
                delete users[userId];
                delete tasksData[userId];
                nextUserId--;
                showMessage('❌ Failed to save user to cloud - user not added', 'error');
                return;
            }
        }
        
        // Only update UI after successful cloud save (or if not using cloud)
        closeAddUserModal();
        refreshAllViews();
        showMessage(`✅ User "${userName}" added successfully and saved to cloud!`, 'success');
        console.log(`User ${userName} added successfully`);
        
    } catch (error) {
        // Rollback on any error
        console.error('Error during user addition:', error);
        delete users[userId];
        delete tasksData[userId];
        nextUserId--;
        
        showMessage('❌ Error adding user - operation cancelled', 'error');
    }
}

function showManageUsersModal() {
    renderUsersList();
    document.getElementById('manage-users-modal').style.display = 'block';
}

function closeManageUsersModal() {
    document.getElementById('manage-users-modal').style.display = 'none';
}

function renderUsersList() {
    const container = document.getElementById('users-list');
    container.innerHTML = '';
    
    Object.values(users).forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-item';
        
        const taskCount = tasksData[user.id] ? tasksData[user.id].length : 0;
        const completedCount = tasksData[user.id] ? tasksData[user.id].filter(t => t.status === 'completed').length : 0;
        
        userDiv.innerHTML = `
            <div class="user-info">
                <div class="user-avatar">${user.name.charAt(0).toUpperCase()}</div>
                <div class="user-details">
                    <h4>${user.name}</h4>
                    <p>${taskCount} tasks, ${completedCount} completed</p>
                </div>
            </div>
            <div class="user-actions">
                ${Object.keys(users).length > 1 ? 
                    `<button class="btn-delete-user" onclick="deleteUser('${user.id}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>` : 
                    '<small style="color: #94a3b8;">Cannot delete last user</small>'
                }
            </div>
        `;
        
        container.appendChild(userDiv);
    });
}

async function deleteUser(userId) {
    if (Object.keys(users).length <= 1) {
        showMessage('Cannot delete the last user!', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete ${users[userId].name} and all their tasks?`)) {
        return;
    }
    
    // Show loading state
    showMessage('🗑️ Deleting user...', 'info');
    
    // Keep backup of data in case we need to rollback
    const userBackup = { ...users[userId] };
    const tasksBackup = tasksData[userId] ? [...tasksData[userId]] : [];
    
    try {
        // First, perform the deletion in memory
        delete users[userId];
        delete tasksData[userId];
        
        // Switch to first available user if current user was deleted
        if (currentPerson === userId) {
            currentPerson = Object.keys(users)[0];
        }
        
        // Try to save to cloud BEFORE updating UI
        if (usingCentralData) {
            const success = await saveData();
            if (!success) {
                // Rollback the deletion if cloud save failed
                users[userId] = userBackup;
                tasksData[userId] = tasksBackup;
                if (currentPerson !== userId && Object.keys(users).includes(userId)) {
                    // Don't change currentPerson back if we switched to a valid user
                }
                showMessage('❌ Failed to delete user from cloud - deletion cancelled', 'error');
                return;
            }
        }
        
        // Only update UI after successful cloud save (or if not using cloud)
        refreshAllViews();
        renderUsersList(); // Refresh the manage users modal
        
        showMessage('✅ User deleted successfully and saved to cloud!', 'success');
        console.log(`User ${userBackup.name} deleted successfully`);
        
    } catch (error) {
        // Rollback on any error
        console.error('Error during user deletion:', error);
        users[userId] = userBackup;
        tasksData[userId] = tasksBackup;
        
        refreshAllViews();
        renderUsersList();
        
        showMessage('❌ Error deleting user - deletion cancelled', 'error');
    }
}

// Sharing Functions
function showShareModal() {
    document.getElementById('share-modal').style.display = 'block';
}

function closeShareModal() {
    document.getElementById('share-modal').style.display = 'none';
}

function exportData() {
    const data = {
        users: users,
        tasksData: tasksData,
        exportDate: new Date().toISOString(),
        version: '1.0'
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accountability-tracker-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showMessage('Data exported successfully!', 'success');
}

function exportCSV() {
    const allTasks = Object.entries(tasksData).flatMap(([userId, tasks]) => 
        tasks.map(task => ({
            User: users[userId].name,
            ...task
        }))
    );
    
    if (allTasks.length === 0) {
        showMessage('No tasks to export!', 'error');
        return;
    }
    
    const headers = ['User', 'Task/Focus Area', 'Priority', 'Status', 'Deadline', 'Update/Notes', 'Date Logged'];
    const csvContent = [
        headers.join(','),
        ...allTasks.map(task => [
            `"${task.User}"`,
            `"${task.name}"`,
            task.priority,
            task.status.replace('-', ' '),
            task.deadline || '',
            `"${task.update.replace(/"/g, '""')}"`,
            task.dateLogged
        ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accountability-tracker-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showMessage('CSV exported successfully!', 'success');
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            if (importedData.users && importedData.tasksData) {
                // Merge imported data
                Object.assign(users, importedData.users);
                Object.assign(tasksData, importedData.tasksData);
                
                if (importedData.nextUserId) nextUserId = Math.max(nextUserId, importedData.nextUserId);
                if (importedData.currentTaskId) currentTaskId = Math.max(currentTaskId, importedData.currentTaskId);
                
                renderPersonButtons();
                updateStats();
                renderTasks();
                renderKanbanBoard();
                renderCalendar();
                saveData();
                
                showMessage('Data imported successfully!', 'success');
                closeShareModal();
            } else {
                throw new Error('Invalid file format');
            }
        } catch (error) {
            showMessage('Error importing data: Invalid file format!', 'error');
        }
    };
    reader.readAsText(file);
    
    // Reset file input
    event.target.value = '';
}

// GitHub Cloud Storage Functions - Pure cloud-based approach
async function saveToGitHub() {
    try {
        const success = await saveData();
        if (success) {
            showMessage('✅ Data successfully saved to GitHub!', 'success');
        } else {
            showMessage('❌ Failed to save to GitHub. Please check your token.', 'error');
        }
    } catch (error) {
        console.error('GitHub save error:', error);
        showMessage('❌ Error saving to GitHub: ' + error.message, 'error');
    }
}

// Test function to check token prompt
async function testTokenPrompt() {
    console.log('Testing token prompt...');
    try {
        const token = await promptForToken();
        if (token) {
            showMessage('✅ Token prompt working! (Token received but not saved)', 'success');
            console.log('Token received (length:', token.length, ')');
        } else {
            showMessage('❌ Token prompt cancelled or empty', 'warning');
            console.log('Token prompt cancelled');
        }
    } catch (error) {
        console.error('Token prompt error:', error);
        showMessage('❌ Error with token prompt: ' + error.message, 'error');
    }
}

async function loadFromGitHub() {
    try {
        let gistId = currentGistId;
        
        // If no stored gist ID, ask user for Gist URL
        if (!gistId) {
            const gistUrl = prompt('Enter the GitHub Gist URL or ID:');
            if (!gistUrl) return;
            
            // Extract gist ID from URL or use as is
            const match = gistUrl.match(/gist\.github\.com\/[^\/]+\/([a-f0-9]+)/);
            gistId = match ? match[1] : gistUrl;
        }

        const response = await fetch(`${GIST_API_URL}/${gistId}`);
        
        if (response.ok) {
            const gist = await response.json();
            const fileContent = gist.files['accountability-data.json'];
            
            if (fileContent) {
                const importedData = JSON.parse(fileContent.content);
                
                // Merge imported data
                if (importedData.users && importedData.tasksData) {
                    users = importedData.users;
                    tasksData = importedData.tasksData;
                    if (importedData.nextUserId) nextUserId = importedData.nextUserId;
                    if (importedData.currentTaskId) currentTaskId = importedData.currentTaskId;
                    
                    currentGistId = gistId;
                    usingCentralData = true; // Enable cloud mode
                    
                    // Show the Gist URL
                    document.getElementById('gist-url').value = gist.html_url;
                    document.getElementById('gist-url-display').style.display = 'block';
                    
                    refreshAllViews();
                    
                    showMessage('✅ Data loaded from cloud successfully!', 'success');
                    closeShareModal();
                } else {
                    throw new Error('Invalid data format in cloud storage');
                }
            } else {
                throw new Error('No data file found in the Gist');
            }
        } else {
            throw new Error('Failed to load from cloud. Check the Gist URL/ID.');
        }
    } catch (error) {
        console.error('Error loading from GitHub:', error);
        showMessage(`Error loading from cloud: ${error.message}`, 'error');
    }
}

function copyGistUrl() {
    const gistUrlInput = document.getElementById('gist-url');
    gistUrlInput.select();
    document.execCommand('copy');
    showMessage('Cloud storage URL copied to clipboard!', 'success');
}

// Close modal
function closeModal() {
    document.getElementById('task-modal').style.display = 'none';
}

// Show message
function showMessage(text, type) {
    // Remove existing messages
    document.querySelectorAll('.message').forEach(msg => msg.remove());
    
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    
    document.querySelector('.container').insertBefore(message, document.querySelector('.stats-section'));
    
    // Auto-remove after delay (except for info messages)
    const delay = type === 'info' ? 5000 : 3000;
    setTimeout(() => {
        if (message.parentNode) {
            message.remove();
        }
    }, delay);
}

// Utility functions
function getStatusIcon(status) {
    switch (status) {
        case 'not-started': return 'fa-play';
        case 'in-progress': return 'fa-spinner';
        case 'completed': return 'fa-check';
        default: return 'fa-question';
    }
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

// Close modal when clicking outside
window.addEventListener('click', function(event) {
    const modals = ['task-modal', 'add-user-modal', 'manage-users-modal', 'share-modal'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
});

// Keyboard shortcuts
document.addEventListener('keydown', function(event) {
    // Escape key to close modals
    if (event.key === 'Escape') {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }
    
    // Ctrl+N to add new task
    if (event.ctrlKey && event.key === 'n') {
        event.preventDefault();
        addTask();
    }
    
    // Ctrl+U to add new user
    if (event.ctrlKey && event.key === 'u') {
        event.preventDefault();
        showAddUserModal();
    }
    
    // Ctrl+S to show share modal
    if (event.ctrlKey && event.key === 's') {
        event.preventDefault();
        showShareModal();
    }
});
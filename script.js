// Global variables
let currentPerson = 'person1';
let currentView = 'table';
let currentTaskId = 0;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

// User management - Initialize from config
let users = CONFIG.DEFAULT_USERS;
let nextUserId = 3;

// GitHub Gist integration for cloud storage
let currentGistId = CONFIG.CENTRAL_GIST_ID || localStorage.getItem('gistId') || null;
const GIST_API_URL = 'https://api.github.com/gists';

// Centralized data flag
let usingCentralData = !!CONFIG.CENTRAL_GIST_ID;

// Session-based token storage (in memory only)
let sessionToken = null;
let tokenExpiry = null;
const TOKEN_SESSION_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds

// Sample data for both people
let tasksData = {
    person1: [
        {
            id: 1,
            name: 'LeetCode Dynamic Programming',
            priority: 'high',
            status: 'in-progress',
            deadline: '2025-10-15',
            update: 'Solved 3 DP problems today: House Robber, Coin Change, and Longest Common Subsequence. Focused on understanding the state transitions and memoization patterns.',
            dateLogged: '2025-09-25'
        },
        {
            id: 2,
            name: 'System Design Course - Grokking',
            priority: 'high',
            status: 'in-progress',
            deadline: '2025-10-30',
            update: 'Completed Chapter 4 on Load Balancers. Practiced designing a URL shortener service. Created detailed notes on horizontal vs vertical scaling.',
            dateLogged: '2025-09-25'
        },
        {
            id: 3,
            name: 'React Portfolio Website',
            priority: 'medium',
            status: 'not-started',
            deadline: '2025-11-01',
            update: 'Set up project structure and installed dependencies. Created wireframes for landing page and project showcase section.',
            dateLogged: '2025-09-24'
        },
        {
            id: 4,
            name: 'Binary Trees & Graphs Practice',
            priority: 'high',
            status: 'in-progress',
            deadline: '2025-10-10',
            update: 'Implemented BFS and DFS from scratch. Solved 5 tree problems including Binary Tree Level Order Traversal and Validate BST.',
            dateLogged: '2025-09-25'
        },
        {
            id: 5,
            name: 'Machine Learning Coursera Course',
            priority: 'medium',
            status: 'completed',
            deadline: '2025-09-20',
            update: 'Completed final project on house price prediction. Achieved 92% accuracy using Random Forest. Submitted certificate.',
            dateLogged: '2025-09-20'
        },
        {
            id: 6,
            name: 'Full-Stack E-commerce App',
            priority: 'low',
            status: 'not-started',
            deadline: '2025-12-15',
            update: 'Researched tech stack options. Decided on MERN stack. Created database schema design for products, users, and orders.',
            dateLogged: '2025-09-23'
        }
    ],
    person2: [
        {
            id: 1,
            name: 'AWS Solutions Architect Certification',
            priority: 'high',
            status: 'in-progress',
            deadline: '2025-10-20',
            update: 'Completed 3 practice tests with 85% average score. Reviewed VPC networking and IAM policies. Scheduled exam for next week.',
            dateLogged: '2025-09-25'
        },
        {
            id: 2,
            name: 'Coding Interview Prep - Arrays & Strings',
            priority: 'high',
            status: 'in-progress',
            deadline: '2025-10-05',
            update: 'Solved 8 problems including Two Sum, Valid Anagram, and Group Anagrams. Practiced explaining solutions aloud for 30 minutes.',
            dateLogged: '2025-09-25'
        },
        {
            id: 3,
            name: 'Flutter Mobile App Development',
            priority: 'medium',
            status: 'in-progress',
            deadline: '2025-11-30',
            update: 'Built login screen with validation. Integrated Firebase Auth. Working on main dashboard UI with bottom navigation.',
            dateLogged: '2025-09-25'
        },
        {
            id: 4,
            name: 'Docker & Kubernetes Learning',
            priority: 'medium',
            status: 'not-started',
            deadline: '2025-11-15',
            update: 'Watched intro videos on containerization concepts. Set up Docker Desktop. Next: create first containerized app.',
            dateLogged: '2025-09-24'
        },
        {
            id: 5,
            name: 'Data Structures Review',
            priority: 'high',
            status: 'completed',
            deadline: '2025-09-15',
            update: 'Completed comprehensive review of LinkedLists, Stacks, Queues, and Hash Tables. Implemented all from scratch in Python.',
            dateLogged: '2025-09-15'
        },
        {
            id: 6,
            name: 'Personal Finance Tracker App',
            priority: 'low',
            status: 'not-started',
            deadline: '2025-12-31',
            update: 'Brainstormed features and user stories. Created mockups in Figma. Planning to use React Native for cross-platform development.',
            dateLogged: '2025-09-22'
        }
    ]
};

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    // Show loading message if using central data
    if (usingCentralData) {
        showMessage('Loading shared data from cloud...', 'info');
        try {
            await loadCentralData();
            showMessage('✅ Connected to shared cloud storage!', 'success');
        } catch (error) {
            console.error('Failed to load central data:', error);
            showMessage('⚠️ Using local storage - central data unavailable', 'warning');
            loadData(); // Fallback to local data
        }
    } else {
        loadData();
    }
    
    currentTaskId = Math.max(...Object.values(tasksData).flat().map(t => t.id)) || 0;
    updateStats();
    renderTasks();
    renderKanbanBoard();
    renderCalendar();
    renderPersonButtons();
    updateTokenStatus(); // Show initial token status
    
    // Set up form submissions
    document.getElementById('task-form').addEventListener('submit', handleTaskSubmit);
    document.getElementById('add-user-form').addEventListener('submit', handleAddUser);
    
    // Set up auto-sync if configured
    if (CONFIG.SYNC_INTERVAL_MINUTES > 0 && usingCentralData) {
        setInterval(syncWithCentralData, CONFIG.SYNC_INTERVAL_MINUTES * 60 * 1000);
    }
});

// Data persistence
function loadData() {
    const saved = localStorage.getItem('accountabilityTracker');
    if (saved) {
        const data = JSON.parse(saved);
        if (data.users) users = data.users;
        if (data.tasksData) {
            // Merge saved data with existing sample data
            Object.keys(data.tasksData).forEach(userId => {
                tasksData[userId] = data.tasksData[userId];
            });
        }
        if (data.nextUserId) nextUserId = data.nextUserId;
        if (data.currentTaskId) currentTaskId = data.currentTaskId;
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
            // Load central data
            if (centralData.users) users = centralData.users;
            if (centralData.tasksData) tasksData = centralData.tasksData;
            if (centralData.nextUserId) nextUserId = centralData.nextUserId;
            if (centralData.currentTaskId) currentTaskId = centralData.currentTaskId;
            // Also save to local storage as backup
            saveData();
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

// Smart token management with session caching
async function getSessionToken() {
    // Check if we have a valid session token
    if (sessionToken && tokenExpiry && Date.now() < tokenExpiry) {
        console.log('Using cached session token');
        return sessionToken;
    }
    
    // Check for configured token
    if (CONFIG.GITHUB_TOKEN) {
        return CONFIG.GITHUB_TOKEN;
    }
    
    // No valid token, prompt user
    console.log('No valid session token, prompting user...');
    const token = await promptForToken();
    
    if (token) {
        // Cache the token for the session
        sessionToken = token;
        tokenExpiry = Date.now() + TOKEN_SESSION_DURATION;
        console.log('Token cached for session (30 minutes)');
        showMessage('🔑 Token saved for this session (30 min) - no more prompts needed!', 'success');
        updateTokenStatus();
    }
    
    return token;
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

// Improved save function with smart token handling
async function saveCentralDataWithToken() {
    if (!currentGistId) {
        console.error('No central Gist ID configured');
        return false;
    }
    
    const token = await getSessionToken();
    if (!token) {
        showMessage('❌ GitHub token required to save to cloud', 'error');
        return false;
    }
    
    return await saveCentralData(token);
}

async function saveCentralData(userToken = null) {
    if (!currentGistId) {
        console.error('No central Gist ID configured');
        return false;
    }
    
    // Get token from user input if not provided
    let token = userToken || CONFIG.GITHUB_TOKEN;
    
    // If no token available, prompt user for secure token entry
    if (!token) {
        console.log('No token available, prompting user...');
        token = await promptForToken();
        if (!token) {
            showMessage('❌ GitHub token required to save to cloud', 'error');
            return false;
        }
        console.log('Token provided by user');
    }
    
    try {
        const data = {
            users: users,
            tasksData: tasksData,
            nextUserId: nextUserId,
            currentTaskId: currentTaskId,
            lastUpdated: new Date().toISOString(),
            version: CONFIG.VERSION
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
    
        console.log('Saving to Gist:', currentGistId);
        const response = await fetch(`${GIST_API_URL}/${currentGistId}`, {
            method: 'PATCH',
            headers: headers,
            body: JSON.stringify(gistData)
        });
        
        if (response.ok) {
            console.log('Data saved to cloud successfully');
            return true;
        } else {
            console.error('Failed to save to cloud:', response.status, response.statusText);
            return false;
        }
    } catch (error) {
        console.error('Error saving to cloud:', error);
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

// Render person buttons dynamically
function renderPersonButtons() {
    const container = document.getElementById('person-buttons');
    container.innerHTML = '';
    
    Object.values(users).forEach((user, index) => {
        const button = document.createElement('button');
        button.className = `person-btn ${index === 0 ? 'active' : ''}`;
        button.onclick = () => switchPerson(user.id);
        button.innerHTML = `<i class="fas fa-user"></i> ${user.name}'s Tracker`;
        container.appendChild(button);
    });
}

// Person switching
function switchPerson(person) {
    currentPerson = person;
    
    // Update button states
    document.querySelectorAll('.person-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Update display
    updateStats();
    renderTasks();
    renderKanbanBoard();
    renderCalendar();
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

// Update statistics
function updateStats() {
    const tasks = tasksData[currentPerson] || [];
    const total = tasks.length;
    const completed = tasks.filter(task => task.status === 'completed').length;
    const inProgress = tasks.filter(task => task.status === 'in-progress').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
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

// Get filtered tasks
function getFilteredTasks() {
    let tasks = tasksData[currentPerson] || [];
    
    const priorityFilter = document.getElementById('priority-filter').value;
    const statusFilter = document.getElementById('status-filter').value;
    
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

// Delete task
function deleteTask(taskId) {
    if (confirm('Are you sure you want to delete this task?')) {
        tasksData[currentPerson] = tasksData[currentPerson].filter(task => task.id !== taskId);
        updateStats();
        renderTasks();
        renderKanbanBoard();
        renderCalendar();
        saveData();
        showMessage('Task deleted successfully!', 'success');
    }
}

// Handle form submission
function handleTaskSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const taskData = {
        name: document.getElementById('task-name').value,
        priority: document.getElementById('task-priority').value,
        status: document.getElementById('task-status').value,
        deadline: document.getElementById('task-deadline').value || null,
        update: document.getElementById('task-update').value,
        dateLogged: new Date().toISOString().split('T')[0]
    };
    
    const mode = e.target.dataset.mode;
    
    if (mode === 'add') {
        taskData.id = ++currentTaskId;
        if (!tasksData[currentPerson]) {
            tasksData[currentPerson] = [];
        }
        tasksData[currentPerson].push(taskData);
        showMessage('Task added successfully!', 'success');
    } else if (mode === 'edit') {
        const taskId = parseInt(e.target.dataset.taskId);
        const taskIndex = tasksData[currentPerson].findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            tasksData[currentPerson][taskIndex] = { ...tasksData[currentPerson][taskIndex], ...taskData };
            showMessage('Task updated successfully!', 'success');
        }
    }
    
    updateStats();
    renderTasks();
    renderKanbanBoard();
    renderCalendar();
    closeModal();
    saveData();
    
    // Auto-save to cloud if centralized data is enabled
    if (usingCentralData) {
        saveCentralDataWithToken().then(success => {
            if (success) {
                showMessage('✅ Data saved to cloud successfully!', 'success');
            } else {
                console.log('Cloud save cancelled or failed');
            }
        }).catch(error => {
            console.error('Cloud save error:', error);
            showMessage('⚠️ Could not save to cloud, data saved locally', 'warning');
        });
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

function handleAddUser(e) {
    e.preventDefault();
    const userName = document.getElementById('user-name').value.trim();
    
    if (!userName) return;
    
    const userId = `person${nextUserId}`;
    users[userId] = { name: userName, id: userId };
    tasksData[userId] = [];
    nextUserId++;
    
    renderPersonButtons();
    closeAddUserModal();
    saveData();
    showMessage(`User "${userName}" added successfully!`, 'success');
    
    // Auto-save to cloud if centralized data is enabled
    if (usingCentralData) {
        saveCentralDataWithToken().then(success => {
            if (success) {
                showMessage('✅ User saved to cloud successfully!', 'success');
            } else {
                console.log('Cloud save cancelled or failed for user');
            }
        }).catch(error => {
            console.error('Cloud save error:', error);
            showMessage('⚠️ Could not save to cloud, data saved locally', 'warning');
        });
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

function deleteUser(userId) {
    if (Object.keys(users).length <= 1) {
        showMessage('Cannot delete the last user!', 'error');
        return;
    }
    
    if (confirm(`Are you sure you want to delete ${users[userId].name} and all their tasks?`)) {
        delete users[userId];
        delete tasksData[userId];
        
        // Switch to first available user if current user was deleted
        if (currentPerson === userId) {
            currentPerson = Object.keys(users)[0];
        }
        
        renderPersonButtons();
        renderUsersList();
        updateStats();
        renderTasks();
        renderKanbanBoard();
        renderCalendar();
        saveData();
        showMessage('User deleted successfully!', 'success');
        
        // Auto-save to cloud if centralized data is enabled
        if (usingCentralData) {
            saveCentralDataWithToken().then(success => {
                if (success) {
                    showMessage('✅ User deletion saved to cloud!', 'success');
                } else {
                    console.log('Cloud save cancelled or failed for user deletion');
                }
            }).catch(error => {
                console.error('Cloud save error:', error);
                showMessage('⚠️ Could not save to cloud, data saved locally', 'warning');
            });
        }
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

// GitHub Cloud Storage Functions
async function saveToGitHub() {
    try {
        // Use centralized save function for consistency
        const success = await saveCentralDataWithToken();
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

// Enhanced save function that auto-syncs to cloud
function saveData() {
    const data = {
        users: users,
        tasksData: tasksData,
        nextUserId: nextUserId,
        currentTaskId: currentTaskId,
        lastUpdated: new Date().toISOString()
    };
    localStorage.setItem('accountabilityTracker', JSON.stringify(data));
    
    // Auto-sync to central storage if enabled
    if (usingCentralData && CONFIG.AUTO_SAVE_TO_CENTRAL) {
        saveCentralData().catch(err => {
            console.error('Failed to save to central storage:', err);
        });
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
                    localStorage.setItem('gistId', currentGistId);
                    
                    // Show the Gist URL
                    document.getElementById('gist-url').value = gist.html_url;
                    document.getElementById('gist-url-display').style.display = 'block';
                    
                    renderPersonButtons();
                    updateStats();
                    renderTasks();
                    renderKanbanBoard();
                    renderCalendar();
                    saveData();
                    
                    showMessage('Data loaded from cloud successfully!', 'success');
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

// Check for cloud updates periodically
setInterval(async () => {
    if (currentGistId) {
        try {
            const response = await fetch(`${GIST_API_URL}/${currentGistId}`);
            if (response.ok) {
                const gist = await response.json();
                const lastUpdated = new Date(gist.updated_at);
                const localData = JSON.parse(localStorage.getItem('accountabilityTracker') || '{}');
                const localUpdated = new Date(localData.lastUpdated || 0);
                
                // If cloud data is newer, show notification
                if (lastUpdated > localUpdated) {
                    const cloudStatus = document.getElementById('cloud-status');
                    cloudStatus.textContent = '🔄';
                    cloudStatus.parentElement.title = 'New updates available - click Share > Load from Cloud';
                }
            }
        } catch (error) {
            console.log('Cloud check failed:', error.message);
        }
    }
}, 60000); // Check every minute

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
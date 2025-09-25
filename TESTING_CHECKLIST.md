# 🧪 Testing Checklist for Accountability Tracker

## Pre-Launch Testing Checklist

### ✅ Basic Functionality
- [ ] **Page loads correctly** - Open index.html in browser
- [ ] **Person switching works** - Click between Alex and Jordan
- [ ] **View switching works** - Toggle between Table, Board, Calendar
- [ ] **Statistics update** - Numbers change when switching people
- [ ] **Pre-filled data visible** - Sample tasks show for both people

### ✅ User Management
- [ ] **Add new user** - Click "Add User" button, enter name
- [ ] **User appears in selector** - New user button shows up
- [ ] **Switch to new user** - Click new user button, see empty tasks
- [ ] **Manage users modal** - Shows all users with task counts
- [ ] **Delete user** - Remove user (but not the last one)

### ✅ Task Management  
- [ ] **Add new task** - Click "+ Add Task", fill form
- [ ] **Edit existing task** - Click Edit button on any task
- [ ] **Delete task** - Click Delete button, confirm removal
- [ ] **Task appears in all views** - Check Table, Board, Calendar
- [ ] **Status updates** - Change task status, see it move in Board view
- [ ] **Priority colors** - High=Red, Medium=Orange, Low=Green

### ✅ Views Testing
- [ ] **Table view complete** - All columns visible and functional
- [ ] **Kanban board working** - Tasks in correct status columns
- [ ] **Calendar view working** - Deadlines show on correct dates
- [ ] **Calendar navigation** - Previous/next month buttons work
- [ ] **Task counts accurate** - Numbers match actual tasks

### ✅ Filtering & Search
- [ ] **Priority filter** - Select High/Medium/Low, see filtered tasks
- [ ] **Status filter** - Select status, see filtered tasks  
- [ ] **Filter combinations** - Try multiple filters together
- [ ] **Filter reset** - Select "All" returns all tasks

### ✅ Data Persistence
- [ ] **Local storage works** - Refresh page, data persists
- [ ] **New users persist** - Add user, refresh, still there
- [ ] **Task changes persist** - Edit task, refresh, changes saved

### ✅ Sharing Features
- [ ] **Export JSON works** - Click Share > Download JSON
- [ ] **Import JSON works** - Import a JSON file back
- [ ] **Export CSV works** - Download CSV for spreadsheets
- [ ] **Share modal opens** - All sharing options visible

### ✅ Responsive Design
- [ ] **Desktop view** - Full functionality on large screens
- [ ] **Tablet view** - Layout adapts nicely
- [ ] **Mobile view** - Usable on phone screens
- [ ] **Modals responsive** - Forms work on all screen sizes

### ✅ Error Handling
- [ ] **Empty task name** - Form validation prevents empty tasks
- [ ] **Delete confirmation** - Confirms before deleting tasks/users
- [ ] **Last user protection** - Cannot delete the only remaining user
- [ ] **Invalid import** - Handles bad JSON files gracefully

### ✅ User Experience
- [ ] **Visual feedback** - Hover effects work smoothly
- [ ] **Success messages** - Green messages for successful actions
- [ ] **Error messages** - Red messages for errors
- [ ] **Loading states** - No broken states during operations
- [ ] **Keyboard shortcuts** - Ctrl+N, Ctrl+U, Ctrl+S, Escape work

## 🚀 Quick Test Procedure

### 1. Basic Test (2 minutes)
1. Open `index.html` in browser
2. Switch between Alex and Jordan - see different tasks
3. Click "+ Add Task" - add a test task
4. Switch to Board view - see task in correct column
5. Delete the test task

### 2. User Management Test (2 minutes)
1. Click "Add User" - add "TestUser"
2. Switch to TestUser - should see empty tracker
3. Add one task for TestUser
4. Go to "Manage" - see user with 1 task
5. Delete TestUser

### 3. Sharing Test (1 minute)
1. Click "Share" button
2. Click "Download JSON" - file downloads
3. Add a task, then import the JSON back
4. Verify original state restored

## 🐛 Known Issues & Fixes

### Issue: Button clicks not working
**Fix**: Ensure all onclick handlers are properly defined in script.js

### Issue: Data not persisting
**Fix**: Check browser localStorage support, try different browser

### Issue: Mobile layout broken  
**Fix**: Test CSS media queries, adjust breakpoints if needed

### Issue: Import/Export not working
**Fix**: Check file handling permissions, try in different browser

## 📱 Browser Compatibility Test

Test in these browsers:
- [ ] **Chrome** (recommended)
- [ ] **Firefox** 
- [ ] **Safari** (Mac)
- [ ] **Edge** (Windows)

## ✅ Final Checklist Before Sharing

- [ ] All sample data displays correctly
- [ ] All buttons and links work
- [ ] No console errors in browser dev tools
- [ ] Mobile responsive design works
- [ ] Export/Import functions work
- [ ] User can add/delete users and tasks
- [ ] Data persists across browser refreshes

---

**Testing Complete?** ✅ The tracker is ready for remote sharing!
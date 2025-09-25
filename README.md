# 🎯 Accountability Tracker for Two People

A **minimal, visually attractive accountability tracker** designed for two people to manage courses, DSA prep, and side projects with action-based daily updates.

![Accountability Tracker](https://img.shields.io/badge/Status-Ready%20to%20Use-brightgreen) ![Version](https://img.shields.io/badge/Version-2.0-blue) ![License](https://img.shields.io/badge/License-MIT-yellow) ![Cloud](https://img.shields.io/badge/Cloud-GitHub%20Pages-orange)

## ✨ Features

### 🔥 Core Features
- **Dynamic User Management**: Add/delete users on-the-fly
- **Action-Based Updates**: Text field for daily accomplishments logging
- **Priority System**: High/Medium/Low with color-coded tags
- **Status Tracking**: Not Started → In Progress → Completed
- **Deadline Management**: Optional deadline setting with calendar integration
- **Multiple Views**: Table, Kanban Board, and Calendar views

### ☁️ Cloud Features (NEW!)
- **Free Website Hosting**: Deploy to GitHub Pages for free
- **Permanent Cloud Storage**: GitHub Gists integration for data persistence
- **Real-time Collaboration**: Share data instantly with remote team members
- **Cross-device Sync**: Access your data from anywhere
- **Auto-backup**: Never lose your progress again

### 📊 Visual Features
- **Modern UI**: Clean, motivating design with gradient backgrounds
- **Progress Indicators**: Visual stats showing completion rates
- **Color Coding**: Intuitive priority and status color schemes
- **Responsive Design**: Works on desktop and mobile devices
- **Interactive Elements**: Modal forms, drag-and-drop feel, smooth animations

### 📈 Views Available
1. **Table View**: Complete overview with all task details
2. **Kanban Board**: Status-based columns for visual workflow
3. **Calendar View**: Deadline-focused monthly calendar

## 🚀 Quick Start Options

### Option 1: Local Use (Instant)
1. **Download all files** to a folder
2. **Open `index.html`** in any modern web browser
3. **Start using immediately** - no installation required!

### Option 2: Free Website (5 minutes)
1. **Follow `CLOUD_DEPLOYMENT.md`** for step-by-step setup
2. **Get your website**: `https://yourusername.github.io/accountability-tracker`
3. **Share with anyone** - works on all devices!

### Option 3: Cloud Collaboration (10 minutes)
1. **Deploy website** (Option 2)
2. **Set up GitHub token** for cloud storage
3. **Enable real-time team collaboration**

## 📁 File Structure
```
Personal Tracker/
├── index.html              # Main application file
├── styles.css              # Modern UI styling
├── script.js               # All functionality and sample data
├── Alex_Accountability_Tracker.csv    # Excel/Sheets template for Alex
├── Jordan_Accountability_Tracker.csv  # Excel/Sheets template for Jordan
├── Excel_Setup_Instructions.md        # Detailed Excel setup guide
└── README.md               # This file
```

## 🎮 How to Use

### Daily Workflow
1. **Switch Person**: Click "Alex's Tracker" or "Jordan's Tracker"
2. **Add New Task**: Click "+ Add Task" button
3. **Log Daily Updates**: Edit tasks to add what you accomplished
4. **Update Status**: Move tasks from "Not Started" → "In Progress" → "Completed"
5. **Set Priorities**: Use High/Medium/Low based on urgency/importance

### Sample Daily Update Format
```
"Solved 3 DP problems: House Robber, Coin Change, and Longest Common Subsequence. 
Focused on understanding state transitions and memoization patterns. 
Time spent: 2.5 hours"
```

### View Switching
- **Table View**: Best for detailed overview and editing
- **Kanban Board**: Perfect for visual status management
- **Calendar View**: Great for deadline planning and scheduling

## 📊 Pre-filled Examples

### Alex's Sample Tasks:
- **LeetCode Dynamic Programming** (High Priority, In Progress)
- **System Design Course** (High Priority, In Progress) 
- **React Portfolio Website** (Medium Priority, Not Started)
- **Binary Trees & Graphs Practice** (High Priority, In Progress)
- **Machine Learning Course** (Medium Priority, Completed)
- **Full-Stack E-commerce App** (Low Priority, Not Started)

### Jordan's Sample Tasks:
- **AWS Solutions Architect Cert** (High Priority, In Progress)
- **Coding Interview Prep** (High Priority, In Progress)
- **Flutter Mobile App** (Medium Priority, In Progress)
- **Docker & Kubernetes Learning** (Medium Priority, Not Started)
- **Data Structures Review** (High Priority, Completed)
- **Personal Finance Tracker** (Low Priority, Not Started)

## 🎨 Visual Design Highlights

### Color Scheme
- **Primary**: Purple gradient (#667eea to #764ba2)
- **High Priority**: Red (#dc2626) - urgent tasks
- **Medium Priority**: Orange (#d97706) - important tasks  
- **Low Priority**: Green (#059669) - nice-to-have tasks
- **Completed**: Green (#16a34a) - finished tasks
- **In Progress**: Blue (#2563eb) - active work
- **Not Started**: Gray (#475569) - future tasks

### UI Elements
- **Glass-morphism effects** with backdrop blur
- **Smooth hover animations** and state transitions
- **Professional typography** using Inter font
- **Intuitive icons** from Font Awesome
- **Mobile-responsive grid** layouts

## 🛠️ Customization Options

### Adding New People
1. Open `script.js`
2. Add new person data in the `tasksData` object
3. Update person selector buttons in `index.html`

### Modifying Categories
- Edit the sample tasks to match your focus areas
- Common categories: Coding, Courses, Projects, Certifications, Reading

### Changing Colors
- Modify CSS custom properties in `styles.css`
- Update priority/status color classes

## 📱 Mobile Support

The tracker is fully responsive and works great on:
- 📱 **Mobile phones** (320px+)
- 📱 **Tablets** (768px+) 
- 💻 **Desktops** (1024px+)
- 🖥️ **Large screens** (1400px+)

## ⌨️ Keyboard Shortcuts

- **Ctrl + N**: Add new task
- **Escape**: Close modal/dialog
- **Click outside modal**: Close modal

## 💡 Tips for Maximum Effectiveness

### Daily Habits
1. **Log specific accomplishments** instead of vague updates
2. **Update status regularly** to maintain momentum
3. **Set realistic deadlines** and adjust as needed
4. **Use priority levels** to focus on what matters most
5. **Review weekly progress** using the stats section

### Accountability Partners
- **Share screenshots** of your progress
- **Set up weekly check-ins** to discuss updates
- **Celebrate completed tasks** together
- **Help each other** stay motivated during tough times

### Best Practices
- **Be specific**: "Solved 5 DP problems" vs "Studied algorithms"
- **Include learnings**: What new concepts did you grasp?
- **Set next steps**: What will you do tomorrow?
- **Track time**: How long did you spend?
- **Note challenges**: What was difficult?

## 🔧 Technical Details

### Technologies Used
- **HTML5**: Semantic structure
- **CSS3**: Modern styling with flexbox/grid
- **Vanilla JavaScript**: No dependencies required
- **Font Awesome**: Icons
- **Google Fonts**: Inter typography

### Browser Support
- ✅ Chrome 80+
- ✅ Firefox 75+
- ✅ Safari 13+
- ✅ Edge 80+

### Data Storage
- **Local Storage**: Data persists in browser (web version)
- **CSV Format**: Easy import/export for spreadsheet apps
- **No server required**: Everything runs locally

## 📈 Future Enhancements

Potential additions based on user feedback:
- **Data export/import** functionality
- **Habit tracking** integration
- **Time tracking** with timers
- **Goal setting** and milestones
- **Achievement badges** and gamification
- **Team collaboration** features
- **Mobile app** version

## 📄 License

This project is open source and available under the [MIT License](https://opensource.org/licenses/MIT).

## 🤝 Contributing

Feel free to:
- Report bugs or issues
- Suggest new features  
- Submit pull requests
- Share your customizations

## 📞 Support

If you have questions or need help:
1. Check the `Excel_Setup_Instructions.md` for spreadsheet help
2. Review the code comments in `script.js` for technical details
3. Create an issue for bugs or feature requests

---

**Ready to start your accountability journey?** 🚀

Open `index.html` in your browser and begin tracking your progress today!
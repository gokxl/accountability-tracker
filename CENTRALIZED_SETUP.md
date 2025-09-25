# 🔧 Centralized Data Setup Guide

Follow these steps to make your accountability tracker share data between all users.

## 🚀 Quick Setup (5 minutes)

### Step 1: Create Initial Data Gist
1. Go to [gist.github.com](https://gist.github.com)
2. **Filename**: `accountability-data.json`
3. **Content**: Copy this initial data structure:

```json
{
  "users": {
    "person1": { "name": "Alex", "id": "person1" },
    "person2": { "name": "Jordan", "id": "person2" }
  },
  "tasksData": {
    "person1": [
      {
        "id": 1,
        "name": "LeetCode Dynamic Programming",
        "priority": "high",
        "status": "in-progress", 
        "deadline": "2025-10-15",
        "update": "Solved 3 DP problems today: House Robber, Coin Change, and Longest Common Subsequence.",
        "dateLogged": "2025-09-25"
      }
    ],
    "person2": [
      {
        "id": 2,
        "name": "AWS Solutions Architect Certification",
        "priority": "high",
        "status": "in-progress",
        "deadline": "2025-10-20", 
        "update": "Completed 3 practice tests with 85% average score. Reviewed VPC networking.",
        "dateLogged": "2025-09-25"
      }
    ]
  },
  "nextUserId": 3,
  "currentTaskId": 2,
  "lastUpdated": "2025-09-25T12:00:00.000Z",
  "version": "2.1"
}
```

4. **Make it Public** (important!)
5. **Click "Create public gist"**
6. **Copy the Gist ID** from URL (e.g., if URL is `https://gist.github.com/username/abc123def456`, the ID is `abc123def456`)

### Step 2: Configure Your Tracker
1. **Edit `config.js`** in your repository
2. **Find this line**: `CENTRAL_GIST_ID: '',`
3. **Update it to**: `CENTRAL_GIST_ID: 'YOUR_GIST_ID_HERE',`
4. **Save and commit** the change to your repository

### Step 3: Test It Works
1. **Visit your website**: `https://yourusername.github.io/accountability-tracker`
2. **Look for message**: "✅ Connected to shared cloud storage!"
3. **All users now share the same data!**

---

## 🔑 Optional: Add GitHub Token for Better Performance

### Why add a token?
- **Higher API limits** (5000 requests/hour vs 60)
- **Ability to update data** (write access)
- **Private gists** (if preferred)

### How to add token:
1. **GitHub** → **Settings** → **Developer settings** → **Personal access tokens**
2. **Generate new token (classic)**
3. **Scopes**: Check only `gist`
4. **Copy the token**
5. **In `config.js`**: Set `GITHUB_TOKEN: 'your_token_here'`

---

## 🔄 How Data Sharing Works

### When someone visits the website:
1. **Loads shared data** from your Gist automatically
2. **Shows "Connected to shared cloud storage" message**
3. **All changes are shared** between users

### When someone makes changes:
- **Local changes** saved immediately
- **Optional**: Auto-sync to cloud (if token provided)
- **Manual sync**: Use Share button to save/load

---

## 🛠️ Configuration Options

In `config.js` you can customize:

```javascript
// Your centralized data storage
CENTRAL_GIST_ID: 'your_gist_id_here',

// GitHub token for write access (optional)
GITHUB_TOKEN: 'your_token_here',

// Auto-load shared data when website opens
AUTO_LOAD_CENTRAL_DATA: true,

// Auto-save changes (requires token)
AUTO_SAVE_TO_CENTRAL: false,

// Check for updates every X minutes
SYNC_INTERVAL_MINUTES: 5,
```

---

## ✅ Verification Checklist

- [ ] Created public Gist with initial data
- [ ] Updated CENTRAL_GIST_ID in config.js
- [ ] Committed changes to repository
- [ ] Website shows "Connected to shared cloud storage"
- [ ] Multiple people can access and see same data
- [ ] Changes are shared between users

---

## 🎯 Result

**Before**: Each person had their own private data  
**After**: Everyone shares the same centralized data storage  

**Perfect for**: Teams, accountability partners, shared projects!

---

## 🔧 Troubleshooting

### "Using local storage - central data unavailable"
- Check CENTRAL_GIST_ID is correct
- Verify Gist is public
- Check internet connection

### Data not updating for other users  
- Ensure all users are using the same website URL
- Check that CENTRAL_GIST_ID is the same for everyone
- Try refreshing the page

### Want to reset data
- Edit the Gist directly on GitHub
- Or create a new Gist and update the config

---

**Ready?** Update your `config.js` file and deploy! Your tracker will be centralized in minutes. 🚀
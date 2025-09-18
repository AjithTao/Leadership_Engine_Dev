# 🚀 New User Setup Guide - Work Buddy

Welcome to **Work Buddy**! This guide will help you get up and running quickly after cloning the project from GitHub.

## 📋 Prerequisites Check

Before you start, ensure you have these installed:

### Required Software
- **Python 3.11+** - [Download here](https://www.python.org/downloads/)
- **Node.js 18+** - [Download here](https://nodejs.org/)
- **Git** - [Download here](https://git-scm.com/downloads)

### Required Accounts & API Keys
- **OpenAI API Key** - [Get from OpenAI](https://platform.openai.com/api-keys)
- **Jira Account** (optional) - Your organization's Jira instance
- **Confluence Account** (optional) - Your organization's Confluence instance

## 🏗️ Step-by-Step Setup

### Step 1: Clone the Repository
```bash
git clone https://github.com/AjithTao/Leadership_Engine_Dev.git
cd Leadership_Engine_Dev
```

### Step 2: Backend Setup

#### 2.1 Create Python Virtual Environment
```bash
# Windows
cd backend
python -m venv venv
venv\Scripts\activate

# Linux/Mac
cd backend
python3 -m venv venv
source venv/bin/activate
```

#### 2.2 Install Python Dependencies
```bash
pip install -r requirements.txt
```

#### 2.3 Create Your Configuration File
**IMPORTANT:** Copy the template and add your actual API keys:

```bash
# Copy the template
cp config/config.env.template backend/config.env
```

Now edit `backend/config.env` with your actual values:
```env
# Environment Variables for Leadership Quality Tool Backend
# IMPORTANT: Replace with your actual OpenAI API key

# OpenAI API Configuration
# Get your API key from: https://platform.openai.com/api-keys
OPENAI_API_KEY=your_actual_openai_api_key_here

# Optional: OpenAI Model Configuration
OPENAI_MODEL=gpt-4o-mini

# Optional: Debug Settings
DEBUG=false
LOG_LEVEL=INFO
```

**⚠️ Security Note:** Never commit your `backend/config.env` file - it's already protected by `.gitignore`.

### Step 3: Frontend Setup

#### 3.1 Install Node.js Dependencies
```bash
cd frontend
npm install
```

#### 3.2 Create Frontend Environment File
```bash
# Create .env.local file
echo "NEXT_PUBLIC_BACKEND_URL=http://localhost:8000" > .env.local
```

### Step 4: Start the Application

#### Option A: Quick Start (Recommended)
```bash
# From the root directory
# Windows
start.bat

# Linux/Mac
./start.sh
```

#### Option B: Manual Start
```bash
# Terminal 1 - Backend
cd backend
python main.py

# Terminal 2 - Frontend (in a new terminal)
cd frontend
npm run dev
```

## 🌐 Access Your Application

Once running, you can access:

- **Frontend Application:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **API Documentation:** http://localhost:8000/docs
- **Health Check:** http://localhost:8000/health

## 🔧 Initial Configuration

### 1. Connect to Jira (Optional)

1. Open http://localhost:3000
2. Navigate to **Connection Settings** (gear icon in left sidebar)
3. Enter your Jira credentials:
   - **Workspace URL:** `https://your-domain.atlassian.net`
   - **Email:** Your Jira account email
   - **API Token:** Generate from [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
4. Click **Test Connection**
5. Save configuration

### 2. Test Work Buddy

Try these sample queries in the chat:
- "Show me all open issues"
- "What's our team performance?"
- "Find documentation about API"
- "Analyze team productivity"

## 🧪 Verify Installation

### Backend Test
```bash
cd tests
python test_integration.py
```

### Frontend Test
```bash
cd frontend
npm test
```

## 🎯 First Steps

### 1. Explore the Interface
- **Work Buddy Chat:** Ask questions about your projects
- **Analytics Dashboard:** View team performance metrics
- **Quick Actions:** Use pre-built prompts for common tasks

### 2. Configure Your Profile
- Set your name and preferences in the interface
- Choose your theme (light/dark)
- Customize dashboard views

### 3. Try Sample Queries
- "Show me all open issues in my project"
- "What's our team's velocity this sprint?"
- "Find documentation about API integration"
- "Analyze our bug trends"

## 🐛 Troubleshooting

### Common Issues

#### Backend Won't Start
```bash
# Check Python version
python --version

# Check virtual environment
which python

# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

#### Frontend Won't Start
```bash
# Check Node.js version
node --version

# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### API Connection Issues
- Verify your OpenAI API key is correct
- Check network connectivity
- Ensure no firewall is blocking localhost:8000
- Check backend logs for error messages

#### Configuration Issues
- Ensure `backend/config.env` exists and has your API key
- Check that `.env.local` exists in frontend directory
- Verify file permissions

### Getting Help

1. **Check the logs:**
   - Backend: Console output in terminal
   - Frontend: Browser developer tools console

2. **Review documentation:**
   - Check `docs/` folder for detailed guides
   - Review API documentation at http://localhost:8000/docs

3. **Contact support:**
   - Create an issue in the GitHub repository
   - Contact the development team

## 📚 Additional Resources

### Documentation
- **[README.md](README.md)** - Project overview
- **[INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md)** - Detailed setup instructions
- **[QUICK_START.md](QUICK_START.md)** - 5-minute setup guide

### External Resources
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [OpenAI API Documentation](https://platform.openai.com/docs)

## 🎉 You're Ready!

Congratulations! You now have Work Buddy running locally. Start exploring the features and don't hesitate to ask questions in the chat interface.

---

**Need help?** Contact the TAO Digital Solutions development team or create an issue in the repository.

**Happy coding!** 🚀

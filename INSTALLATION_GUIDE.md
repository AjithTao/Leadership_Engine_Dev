# 🚀 Work Buddy - Complete Installation Guide

Welcome to **Work Buddy**, your AI-powered leadership assistant! This guide will help new team members get up and running quickly.

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

### Required Software
- **Python 3.11+** - [Download here](https://www.python.org/downloads/)
- **Node.js 18+** - [Download here](https://nodejs.org/)
- **Git** - [Download here](https://git-scm.com/downloads)
- **VS Code** (recommended) - [Download here](https://code.visualstudio.com/)

### Required Accounts & API Keys
- **OpenAI API Key** - [Get from OpenAI](https://platform.openai.com/api-keys)
- **Jira Account** - Your organization's Jira instance
- **Confluence Account** - Your organization's Confluence instance

## 🏗️ Installation Steps

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

#### 2.3 Configure Environment Variables

Create a `backend/config.env` file:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Jira Configuration (Optional - can be configured via UI)
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your_email@example.com
JIRA_API_TOKEN=your_jira_api_token

# Confluence Configuration (Optional - uses same credentials as Jira)
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net/wiki
CONFLUENCE_EMAIL=your_email@example.com
CONFLUENCE_API_TOKEN=your_jira_api_token
```

**⚠️ Important:** Never commit the `config.env` file to version control!

### Step 3: Frontend Setup

#### 3.1 Install Node.js Dependencies

```bash
cd frontend
npm install
```

#### 3.2 Configure Frontend Environment

Create a `frontend/.env.local` file:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

## 🚀 Running the Application

### Option 1: Quick Start (Recommended)

Use the provided startup scripts:

```bash
# Windows
start.bat

# Linux/Mac
./start.sh
```

### Option 2: Manual Start

#### Start Backend
```bash
cd backend
python main.py
```

#### Start Frontend (in a new terminal)
```bash
cd frontend
npm run dev
```

## 🌐 Access Points

Once running, you can access:

- **Frontend Application:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **API Documentation:** http://localhost:8000/docs
- **Health Check:** http://localhost:8000/health

## 🔧 Initial Configuration

### 1. Connect to Jira

1. Open http://localhost:3000
2. Navigate to the **Connection Settings** tab
3. Enter your Jira credentials:
   - **Workspace URL:** `https://your-domain.atlassian.net`
   - **Email:** Your Jira account email
   - **API Token:** Generate from [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
4. Click **Test Connection**
5. Save configuration

### 2. Connect to Confluence

Confluence will automatically use the same credentials as Jira. If you need separate credentials:

1. Go to **Connection Settings**
2. Configure Confluence separately
3. Test the connection

## 🧪 Testing Your Installation

### Backend Tests
```bash
cd tests
python test_integration.py
python test_ai.py
```

### Frontend Tests
```bash
cd frontend
npm test
```

## 🎯 First Steps

### 1. Explore the Interface
- **Work Buddy Chat:** Ask questions about your projects
- **Analytics Dashboard:** View team performance metrics
- **Insights:** Get AI-powered recommendations

### 2. Try Sample Queries
- "Show me all open issues in my project"
- "What's our team's velocity this sprint?"
- "Find documentation about API integration"
- "Analyze our bug trends"

### 3. Configure Your Profile
- Set your name and preferences
- Choose your theme (light/dark)
- Customize dashboard views

## 🛠️ Development Setup

### For Developers

#### Backend Development
```bash
cd backend
# Install development dependencies
pip install -r requirements.txt
pip install pytest black flake8

# Run linting
flake8 .
black .

# Run tests
pytest tests/
```

#### Frontend Development
```bash
cd frontend
# Install development dependencies
npm install

# Run linting
npm run lint

# Run type checking
npm run type-check
```

### Code Structure

```
Work Buddy/
├── backend/                 # FastAPI backend
│   ├── main.py             # Main API server
│   ├── intelligent_ai_engine.py  # AI engine
│   ├── jira_client.py       # Jira integration
│   ├── confluence_client.py # Confluence integration
│   └── requirements.txt     # Python dependencies
├── frontend/               # Next.js frontend
│   ├── app/                # Next.js app directory
│   ├── components/         # React components
│   └── package.json        # Node.js dependencies
├── docs/                   # Documentation
├── tests/                  # Test files
└── scripts/                # Startup scripts
```

## 🔒 Security Best Practices

### API Key Management
- Never commit API keys to version control
- Use environment variables for sensitive data
- Rotate API keys regularly
- Use different keys for development/production

### Environment Separation
- Use separate Jira/Confluence instances for testing
- Keep development data separate from production
- Use test API keys when possible

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
- Verify your API keys are correct
- Check network connectivity
- Ensure Jira/Confluence URLs are accessible
- Check firewall settings

#### Database Issues
- Work Buddy uses in-memory storage by default
- No database setup required for basic functionality
- Data is cached in browser localStorage

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
- **[Integration Guide](docs/INTEGRATION_GUIDE.md)** - Detailed setup instructions
- **[User Guide](docs/LEADERSHIP_USER_GUIDE.md)** - Complete user manual
- **[API Documentation](http://localhost:8000/docs)** - Interactive API docs

### External Resources
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Jira REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [Confluence REST API](https://developer.atlassian.com/cloud/confluence/rest/v1/)

## 🎉 You're Ready!

Congratulations! You now have Work Buddy running locally. Start exploring the features and don't hesitate to ask questions in the chat interface.

---

**Need help?** Contact the TAO Digital Solutions development team or create an issue in the repository.

**Happy coding!** 🚀

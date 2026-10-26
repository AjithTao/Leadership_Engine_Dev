# FalconX Leadership Engine

AI-powered project management assistant integrating with Jira, Confluence, and enterprise tools for real-time insights, analytics, and intelligent recommendations.

## Features

- **AI Assistant**: Natural language queries for Jira/Confluence with context-aware responses and intelligent JQL generation
- **Analytics Dashboard**: Real-time project metrics, sprint velocity tracking, team performance analytics
- **Multi-Platform Integration**: Jira, Confluence, Salesforce, GitHub with secure authentication
- **Export Capabilities**: Excel, PDF reports, PowerPoint presentations
- **TCOE/QCOE Metrics**: Test coverage analysis, defect leakage tracking, automation metrics

## Prerequisites

| Software | Version | Download |
|----------|---------|----------|
| Python | 3.11+ | [python.org](https://www.python.org/downloads/) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org/) |
| Git | Latest | [git-scm.com](https://git-scm.com/) |
| Docker (optional) | Latest | [docker.com](https://www.docker.com/) |

## Quick Start

### Windows
```batch
start.bat
```

### Linux/Mac
```bash
chmod +x start.sh
./start.sh
```

### Docker
```bash
docker-compose up -d
```

### Free TAO proof-of-concept hosting

For the Jira, Confluence, and GitHub-only Render deployment (AI and LDAP
disabled), follow [DEPLOY_RENDER.md](DEPLOY_RENDER.md). The repository-root
`render.yaml` creates the API and static frontend services.

## Manual Installation

### 1. Clone Repository
```bash
git clone <repository-url>
cd Leadership_Engine_Dev-main
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Frontend Setup
```bash
cd frontend
npm install
```

### 4. Configure Environment

Copy the template and add your credentials:
```bash
cp backend/config/env.template backend/config/.env
```

Edit `backend/config/.env`:
```env
# OpenAI (Required for AI features)
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o-mini

# Jira Integration
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-jira-api-token
JIRA_BOARD_ID=your-board-id

# Confluence Integration (Optional)
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net/wiki
CONFLUENCE_EMAIL=your-email@example.com
CONFLUENCE_API_TOKEN=your-confluence-api-token
CONFLUENCE_SPACE_KEY=your-space-key
```

> **Get Jira/Confluence API Token**: [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)

### 5. Start Services

**Backend** (Terminal 1):
```bash
cd backend
python main.py
```

**Frontend** (Terminal 2):
```bash
cd frontend
npm run dev
```

## Access Points

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |
| Health Check | http://localhost:8000/health |

## Project Structure

```
Leadership_Engine_Dev-main/
├── backend/                    # FastAPI Python backend
│   ├── main.py                # API server entry point
│   ├── services/              # Business logic
│   │   ├── ai_engine.py       # AI/LLM integration
│   │   ├── jira.py            # Jira API client
│   │   ├── confluence.py      # Confluence API client
│   │   ├── analytics.py       # Analytics engine
│   │   ├── jql_processor.py   # JQL query processing
│   │   └── tcoe_dashboard.py  # TCOE metrics
│   ├── config/                # Configuration & auth
│   ├── models/                # Data models
│   ├── middleware/            # API middleware
│   └── utils/                 # Utility modules
│
├── frontend/                   # Next.js React frontend
│   ├── app/                   # Next.js app directory
│   ├── src/                   # Source utilities & hooks
│   └── public/                # Static assets
│
├── config/                     # Global configuration templates
├── scripts/                    # Startup & deployment scripts
├── tests/                      # Test suite
├── docker-compose.yml          # Docker orchestration
└── README.md                   # This file
```

## Testing

```bash
cd tests
python test_integration.py
python test_api_connectivity.py
pytest
```

## API Endpoints

### Core Endpoints
- `POST /chat` - AI chat interface
- `GET /health` - Health check
- `GET /api/projects` - List Jira projects

### Analytics
- `GET /api/analytics/sprint` - Sprint metrics
- `GET /api/analytics/team` - Team performance
- `GET /api/tcoe/metrics` - TCOE dashboard data

### Export
- `POST /api/export/excel` - Export to Excel
- `POST /api/export/pdf` - Export to PDF

## Configuration Options

### LLM Providers
- **OpenAI**: Set `OPENAI_API_KEY`
- **Ollama** (local): Set `OLLAMA_BASE_URL` and `OLLAMA_MODEL`
- **AWS Bedrock**: Set `AWS_REGION` and `BEDROCK_MODEL_ID`

### Integrations
| Integration | Required Variables |
|-------------|-------------------|
| Jira | `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` |
| Confluence | `CONFLUENCE_BASE_URL`, `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN` |
| Salesforce | `SALESFORCE_INSTANCE_URL`, `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET` |
| GitHub | `GITHUB_TOKEN` |
| Tableau | `TABLEAU_SERVER_URL`, `TABLEAU_SITE_ID`, `TABLEAU_PAT_NAME`, `TABLEAU_PAT_SECRET` |

## Troubleshooting

### Backend won't start
1. Check Python version: `python --version` (needs 3.11+)
2. Ensure virtual environment is activated
3. Install dependencies: `pip install -r requirements.txt`

### Frontend won't start
1. Check Node version: `node --version` (needs 18+)
2. Clear cache: `rm -rf node_modules && npm install`

### API connection issues
1. Verify `.env` file exists in `backend/config/`
2. Check API credentials are valid
3. Test endpoints at http://localhost:8000/docs

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes and test
3. Submit a pull request

## License

Proprietary - Internal Use Only

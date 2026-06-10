#!/bin/bash

# Leadership Engine Deployment Script
# This script helps deploy the application to a server

set -e  # Exit on error

echo "🚀 Leadership Engine Deployment Script"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo -e "${YELLOW}Warning: Running as root. Consider using a non-root user.${NC}"
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command_exists python3; then
    echo -e "${RED}❌ Python 3 is not installed${NC}"
    exit 1
fi

if ! command_exists node; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi

if ! command_exists npm; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"

# Ask for deployment type
echo ""
echo "Select deployment type:"
echo "1) Docker (Recommended)"
echo "2) Manual (Systemd services)"
read -p "Enter choice [1-2]: " deploy_type

case $deploy_type in
    1)
        echo "🐳 Setting up Docker deployment..."
        
        if ! command_exists docker; then
            echo -e "${RED}❌ Docker is not installed${NC}"
            exit 1
        fi
        
        if ! command_exists docker-compose; then
            echo -e "${RED}❌ Docker Compose is not installed${NC}"
            exit 1
        fi
        
        echo "Building Docker images..."
        docker-compose build
        
        echo "Starting services..."
        docker-compose up -d
        
        echo -e "${GREEN}✅ Docker deployment complete!${NC}"
        echo "View logs: docker-compose logs -f"
        ;;
    2)
        echo "🖥️  Setting up manual deployment..."
        
        # Backend setup
        echo "Setting up backend..."
        cd backend
        if [ ! -d "venv" ]; then
            python3 -m venv venv
        fi
        source venv/bin/activate
        pip install -r requirements.txt
        deactivate
        cd ..
        
        # Frontend setup
        echo "Setting up frontend..."
        cd frontend
        npm install
        npm run build
        cd ..
        
        echo -e "${GREEN}✅ Manual setup complete!${NC}"
        echo "Next steps:"
        echo "1. Configure systemd services (see DEPLOYMENT.md)"
        echo "2. Set up Nginx reverse proxy (see DEPLOYMENT.md)"
        ;;
    *)
        echo -e "${RED}❌ Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}🎉 Deployment script completed!${NC}"
echo ""
echo "Next steps:"
echo "1. Configure environment variables (backend/config/.env)"
echo "2. Test the application (http://localhost:3000)"
echo "3. Review DEPLOYMENT.md for production configuration"


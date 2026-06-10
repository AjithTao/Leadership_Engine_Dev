#!/bin/bash

# Leadership Engine Setup Verification Script
# Checks if all prerequisites and configurations are in place

set -e

echo "🔍 Leadership Engine Setup Verification"
echo "======================================="

ERRORS=0
WARNINGS=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_command() {
    if command -v "$1" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ $1 is installed${NC}"
        return 0
    else
        echo -e "${RED}❌ $1 is NOT installed${NC}"
        ERRORS=$((ERRORS + 1))
        return 1
    fi
}

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✅ $1 exists${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  $1 is missing${NC}"
        WARNINGS=$((WARNINGS + 1))
        return 1
    fi
}

check_directory() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✅ $1 directory exists${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  $1 directory is missing${NC}"
        WARNINGS=$((WARNINGS + 1))
        return 1
    fi
}

echo ""
echo "📋 Checking Prerequisites..."
echo "---------------------------"

check_command "python3"
check_command "node"
check_command "npm"

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "   Python version: $PYTHON_VERSION"

# Check Node version
NODE_VERSION=$(node --version)
echo "   Node version: $NODE_VERSION"

echo ""
echo "📁 Checking Project Structure..."
echo "-------------------------------"

check_directory "backend"
check_directory "frontend"
check_file "backend/requirements.txt"
check_file "frontend/package.json"
check_file "docker-compose.yml"

echo ""
echo "⚙️  Checking Configuration..."
echo "----------------------------"

check_file "backend/config/.env"
if [ -f "backend/config/.env" ]; then
    # Check if .env has required variables
    if grep -q "OPENAI_API_KEY" backend/config/.env && ! grep -q "your-api-key" backend/config/.env; then
        echo -e "${GREEN}✅ OPENAI_API_KEY is configured${NC}"
    else
        echo -e "${YELLOW}⚠️  OPENAI_API_KEY needs to be configured${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
fi

echo ""
echo "📦 Checking Dependencies..."
echo "---------------------------"

if [ -d "backend/venv" ]; then
    echo -e "${GREEN}✅ Backend virtual environment exists${NC}"
else
    echo -e "${YELLOW}⚠️  Backend virtual environment not found${NC}"
    WARNINGS=$((WARNINGS + 1))
fi

if [ -d "frontend/node_modules" ]; then
    echo -e "${GREEN}✅ Frontend node_modules exists${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend node_modules not found (run: npm install)${NC}"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "📊 Summary"
echo "----------"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Setup is complete.${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Setup has $WARNINGS warning(s) but should work${NC}"
    exit 0
else
    echo -e "${RED}❌ Setup has $ERRORS error(s) and $WARNINGS warning(s)${NC}"
    echo "Please fix the errors before proceeding."
    exit 1
fi


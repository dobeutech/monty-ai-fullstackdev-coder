#!/bin/bash

# ============================================================================
# Unique Staffing Professionals Inc. - Initialization Script (Unix/Linux/Mac)
# ============================================================================

echo "============================================================================"
echo "  Unique Staffing Professionals Inc. - Development Environment Setup"
echo "============================================================================"
echo ""

# Navigate to project directory
PROJECT_DIR="E:/cursor/cursor-projects/uniquestaffingprofessionals/unique-staffing-prof"

# Check if running on Windows Git Bash
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Convert path for Windows
    PROJECT_DIR="/e/cursor/cursor-projects/uniquestaffingprofessionals/unique-staffing-prof"
fi

echo "📁 Project Directory: $PROJECT_DIR"
echo ""

# Check if project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ ERROR: Project directory does not exist!"
    echo "   Expected: $PROJECT_DIR"
    echo ""
    echo "Please create the project directory or update the path in this script."
    exit 1
fi

cd "$PROJECT_DIR" || exit 1

echo "✅ Changed to project directory"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    echo ""

    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        echo "❌ ERROR: npm is not installed!"
        echo "   Please install Node.js and npm first."
        echo "   Visit: https://nodejs.org/"
        exit 1
    fi

    npm install

    if [ $? -ne 0 ]; then
        echo ""
        echo "❌ ERROR: npm install failed!"
        exit 1
    fi

    echo ""
    echo "✅ Dependencies installed successfully"
else
    echo "✅ Dependencies already installed (node_modules found)"
fi

echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  WARNING: .env file not found!"
    echo ""
    echo "Please create a .env file with the following variables:"
    echo "  - VITE_SUPABASE_URL"
    echo "  - VITE_SUPABASE_ANON_KEY"
    echo "  - SUPABASE_SERVICE_ROLE_KEY (for admin operations)"
    echo ""
    echo "You can copy .env.example to .env if it exists:"
    echo "  cp .env.example .env"
    echo ""
else
    echo "✅ Environment file (.env) found"
fi

echo ""

# Check if Supabase is configured
echo "📊 Checking Supabase configuration..."
if grep -q "VITE_SUPABASE_URL" .env 2>/dev/null && grep -q "VITE_SUPABASE_ANON_KEY" .env 2>/dev/null; then
    echo "✅ Supabase environment variables found"
else
    echo "⚠️  WARNING: Supabase environment variables not configured"
fi

echo ""
echo "============================================================================"
echo "  Starting Development Server"
echo "============================================================================"
echo ""

# Start the development server
echo "🚀 Starting Vite development server..."
echo ""
echo "The application will be available at:"
echo "  → Local:   http://localhost:5173"
echo "  → Network: Check console output for network URL"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""
echo "============================================================================"
echo ""

npm run dev

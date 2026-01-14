# ============================================================================
# Unique Staffing Professionals Inc. - Initialization Script (Windows PowerShell)
# ============================================================================

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  Unique Staffing Professionals Inc. - Development Environment Setup" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# Project directory
$PROJECT_DIR = "E:\cursor\cursor-projects\uniquestaffingprofessionals\unique-staffing-prof"

Write-Host "📁 Project Directory: $PROJECT_DIR" -ForegroundColor Yellow
Write-Host ""

# Check if project directory exists
if (-Not (Test-Path -Path $PROJECT_DIR)) {
    Write-Host "❌ ERROR: Project directory does not exist!" -ForegroundColor Red
    Write-Host "   Expected: $PROJECT_DIR" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please create the project directory or update the path in this script." -ForegroundColor Yellow
    exit 1
}

# Change to project directory
Set-Location -Path $PROJECT_DIR

Write-Host "✅ Changed to project directory" -ForegroundColor Green
Write-Host ""

# Check if node_modules exists
if (-Not (Test-Path -Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    Write-Host ""

    # Check if npm is installed
    try {
        $npmVersion = npm --version 2>$null
        if (-Not $npmVersion) {
            throw "npm not found"
        }
    }
    catch {
        Write-Host "❌ ERROR: npm is not installed!" -ForegroundColor Red
        Write-Host "   Please install Node.js and npm first." -ForegroundColor Red
        Write-Host "   Visit: https://nodejs.org/" -ForegroundColor Yellow
        exit 1
    }

    npm install

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "❌ ERROR: npm install failed!" -ForegroundColor Red
        exit 1
    }

    Write-Host ""
    Write-Host "✅ Dependencies installed successfully" -ForegroundColor Green
}
else {
    Write-Host "✅ Dependencies already installed (node_modules found)" -ForegroundColor Green
}

Write-Host ""

# Check if .env file exists
if (-Not (Test-Path -Path ".env")) {
    Write-Host "⚠️  WARNING: .env file not found!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please create a .env file with the following variables:" -ForegroundColor Yellow
    Write-Host "  - VITE_SUPABASE_URL" -ForegroundColor White
    Write-Host "  - VITE_SUPABASE_ANON_KEY" -ForegroundColor White
    Write-Host "  - SUPABASE_SERVICE_ROLE_KEY (for admin operations)" -ForegroundColor White
    Write-Host ""
    Write-Host "You can copy .env.example to .env if it exists:" -ForegroundColor Yellow
    Write-Host "  Copy-Item .env.example .env" -ForegroundColor White
    Write-Host ""
}
else {
    Write-Host "✅ Environment file (.env) found" -ForegroundColor Green
}

Write-Host ""

# Check if Supabase is configured
Write-Host "📊 Checking Supabase configuration..." -ForegroundColor Yellow
if ((Test-Path -Path ".env") -and (Select-String -Path ".env" -Pattern "VITE_SUPABASE_URL" -Quiet) -and (Select-String -Path ".env" -Pattern "VITE_SUPABASE_ANON_KEY" -Quiet)) {
    Write-Host "✅ Supabase environment variables found" -ForegroundColor Green
}
else {
    Write-Host "⚠️  WARNING: Supabase environment variables not configured" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  Starting Development Server" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# Start the development server
Write-Host "🚀 Starting Vite development server..." -ForegroundColor Yellow
Write-Host ""
Write-Host "The application will be available at:" -ForegroundColor Yellow
Write-Host "  → Local:   http://localhost:5173" -ForegroundColor Cyan
Write-Host "  → Network: Check console output for network URL" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

npm run dev

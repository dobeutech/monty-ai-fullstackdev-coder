#
# Development Environment Initialization Script (Windows PowerShell)
# This script is called by the agent to set up and start the development server.
#
# Usage: .\scripts\init.ps1 [options]
#   -Install     Run npm install before starting
#   -Build       Run build before starting
#   -Test        Run tests instead of dev server
#

param(
    [switch]$Install,
    [switch]$Build,
    [switch]$Test
)

$ErrorActionPreference = "Stop"

Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Blue
Write-Host "         Development Environment Initialization                  " -ForegroundColor Blue
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Blue

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Host "Error: package.json not found. Are you in the project root?" -ForegroundColor Red
    exit 1
}

# Install dependencies if requested or if node_modules doesn't exist
if ($Install -or -not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: npm install failed" -ForegroundColor Red
        exit 1
    }
}

# Run build if requested
if ($Build) {
    Write-Host "Building project..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: build failed" -ForegroundColor Red
        exit 1
    }
}

# Run tests if requested
if ($Test) {
    Write-Host "Running tests..." -ForegroundColor Yellow
    npm test
    exit $LASTEXITCODE
}

# Start development server
Write-Host "Starting development server..." -ForegroundColor Green
Write-Host "────────────────────────────────────────────────────────────────" -ForegroundColor Blue

# Read package.json to check for available scripts
$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$scripts = $packageJson.scripts

if ($scripts.dev) {
    npm run dev
} elseif ($scripts.start) {
    npm start
} else {
    Write-Host "Error: No 'dev' or 'start' script found in package.json" -ForegroundColor Red
    Write-Host "Available scripts:" -ForegroundColor Yellow
    npm run
    exit 1
}

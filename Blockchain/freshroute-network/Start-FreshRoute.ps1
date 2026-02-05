# Complete FreshRoute Network Startup Script for Windows
# This script starts the full production network with CAs, orderers, peers, and CouchDB

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " FreshRoute Network - Complete Startup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host

# Navigate to network directory
Set-Location $PSScriptRoot

# Step 1: Clean start
Write-Host "Step 1: Cleaning previous network (if any)..." -ForegroundColor Yellow
& .\network.sh down

# Step 2: Start the infrastructure
Write-Host "`nStep 2: Starting network infrastructure..." -ForegroundColor Yellow
& .\network.sh up

# Step 3: Create channel
Write-Host "`nStep 3: Creating channel..." -ForegroundColor Yellow
& .\network.sh createChannel

# Step 4: Deploy chaincode
Write-Host "`nStep 4: Deploying chaincode..." -ForegroundColor Yellow
& .\scripts\deployCCAAS.sh

# Step 5: Verify network health
Write-Host "`nStep 5: Checking network health..." -ForegroundColor Yellow
& .\scripts\healthcheck.sh

# Step 6: Enroll admin users
Write-Host "`nStep 6: Enrolling admin users..." -ForegroundColor Yellow
Set-Location api-gateway

# Enroll admin for each organization
Write-Host "  Enrolling farmer admin..." -ForegroundColor Gray
$env:ORG_NAME = "farmer"
node src/enrollUser.js admin

Write-Host "  Enrolling buyer admin..." -ForegroundColor Gray
$env:ORG_NAME = "buyer"
node src/enrollUser.js admin

Write-Host "  Enrolling transporter admin..." -ForegroundColor Gray
$env:ORG_NAME = "transporter"
node src/enrollUser.js admin

# Enroll application users
Write-Host "`n  Enrolling application users..." -ForegroundColor Gray
$env:ORG_NAME = "farmer"
node src/enrollUser.js user farmerApp

$env:ORG_NAME = "buyer"
node src/enrollUser.js user buyerApp

$env:ORG_NAME = "transporter"
node src/enrollUser.js user transporterApp

Set-Location ..

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "  FreshRoute Network is Ready!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host

Write-Host "Network Status:" -ForegroundColor Cyan
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | Select-String -Pattern "freshroute|NAME"

Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "  - Start API Gateway: cd api-gateway && npm start"
Write-Host "  - Run health check: .\scripts\healthcheck.sh"
Write-Host "  - View logs: docker logs <container-name>"
Write-Host "  - API Gateway will be at: http://localhost:3000"
Write-Host "  - Stop network: .\network.sh down"
Write-Host

Write-Host "Admin Users Enrolled:" -ForegroundColor Cyan
Get-ChildItem -Path "api-gateway\wallet" -Filter "*.id" | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor Gray }
Write-Host

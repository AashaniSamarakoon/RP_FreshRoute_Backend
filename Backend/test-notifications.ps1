# Test notifications API
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjVmYTZjY2ZjLWEyMWQtNDc2Yi1iOTlmLTliYzc1ZTE0NmU2OSIsImVtYWlsIjoiZmFybWVyQHRlc3QuY29tIiwicm9sZSI6ImZhcm1lciIsIm5hbWUiOiJUZXN0IEZhcm1lciIsImlhdCI6MTc2NzU4OTM5NiwiZXhwIjoxNzY4MTk0MTk2fQ.kS0vhLrz9cqmqSguRczQVeRON3ji6_blugcGl9Up234"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

Write-Host "Testing Notifications API..." -ForegroundColor Cyan

# Test 1: Get all notifications
Write-Host "`n1. GET /api/farmer/notifications" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:4000/api/farmer/notifications" -Method GET -Headers $headers
    Write-Host "✅ SUCCESS" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 10)
} catch {
    Write-Host "❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Get notification stats
Write-Host "`n2. GET /api/farmer/notifications/stats" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:4000/api/farmer/notifications/stats" -Method GET -Headers $headers
    Write-Host "✅ SUCCESS" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 10)
} catch {
    Write-Host "❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Get notifications by category
Write-Host "`n3. GET /api/farmer/notifications/category/price_alert" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:4000/api/farmer/notifications/category/price_alert" -Method GET -Headers $headers
    Write-Host "✅ SUCCESS" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 10)
} catch {
    Write-Host "❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

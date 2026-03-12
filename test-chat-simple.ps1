# Simple Chat Service Test
Write-Host "=== Testing Chat Service ===" -ForegroundColor Cyan

$apiUrl = "http://localhost:3000/api"
$chatUrl = "http://localhost:3009/api"

# Login as user 1
Write-Host "[1/4] Login user 1 (e@e.com)..." -ForegroundColor Yellow
$user1 = Invoke-RestMethod -Uri "$apiUrl/auth/login" -Method POST -Body (@{ email="e@e.com"; password="Janith1111*" } | ConvertTo-Json) -ContentType "application/json"
Write-Host "   OK - ID: $($user1.user.id), Role: $($user1.user.role)" -ForegroundColor Green

# Login as user 2
Write-Host "[2/4] Login user 2 (z@z.com)..." -ForegroundColor Yellow
$user2 = Invoke-RestMethod -Uri "$apiUrl/auth/login" -Method POST -Body (@{ email="z@z.com"; password="Janith1111*" } | ConvertTo-Json) -ContentType "application/json"
Write-Host "   OK - ID: $($user2.user.id), Role: $($user2.user.role)" -ForegroundColor Green

# Create conversation
Write-Host "[3/4] Create conversation..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization"="Bearer $($user2.accessToken)"; "Content-Type"="application/json" }
    $conv = Invoke-RestMethod -Uri "$chatUrl/chat/conversations" -Method POST -Headers $headers -Body (@{salonId=$user1.user.id} | ConvertTo-Json)
    Write-Host "   OK - Conversation ID: $($conv._id)" -ForegroundColor Green

    # Get messages
    Write-Host "[4/4] Get messages..." -ForegroundColor Yellow
    $msgs = Invoke-RestMethod -Uri "$chatUrl/chat/conversations/$($conv._id)/messages" -Method GET -Headers @{"Authorization"="Bearer $($user2.accessToken)"}
    Write-Host "   OK - Messages: $($msgs.total)" -ForegroundColor Green

    Write-Host ""
    Write-Host "SUCCESS: Chat service is working!" -ForegroundColor Green
    Write-Host "Conversation ID: $($conv._id)" -ForegroundColor White
    Write-Host ""
    Write-Host "Test WebSocket in browser:" -ForegroundColor Cyan
    Write-Host "1. Login at http://localhost:4200" -ForegroundColor White
    Write-Host "2. Open DevTools Console" -ForegroundColor White
    Write-Host "3. Navigate to Chat page" -ForegroundColor White
    Write-Host "4. Send messages and check real-time delivery" -ForegroundColor White
} catch {
    $err = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host "   ERROR: $($err.message)" -ForegroundColor Red
}

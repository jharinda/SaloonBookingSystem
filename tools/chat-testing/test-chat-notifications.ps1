Write-Host "`n=== Chat Notification Test ===" -ForegroundColor Cyan

# Login users
Write-Host "`n[1] Login users..." -ForegroundColor Yellow
$apiUrl = "http://localhost:3000/api"
$chatUrl = "http://localhost:3009/api"

$eUser = Invoke-RestMethod -Uri "$apiUrl/auth/login" -Method POST -Body (@{email="e@e.com";password="Janith1111*"}|ConvertTo-Json) -ContentType "application/json"
$bUser = Invoke-RestMethod -Uri "$apiUrl/auth/login" -Method POST -Body (@{email="b@b.com";password="Janith1111*"}|ConvertTo-Json) -ContentType "application/json"

Write-Host "e@e.com: $($eUser.user.id) ($($eUser.user.role))" -ForegroundColor Gray
Write-Host "b@b.com: $($bUser.user.id) ($($bUser.user.role))" -ForegroundColor Gray

# Get conversation
Write-Host "`n[2] Get conversation..." -ForegroundColor Yellow
$eHeaders = @{"Authorization"="Bearer $($eUser.accessToken)"}
$convs = Invoke-RestMethod -Uri "$chatUrl/chat/conversations" -Method GET -Headers $eHeaders

if ($convs.Count -eq 0) {
    Write-Host "No conversations found!" -ForegroundColor Red
    exit 1
}

$conv = $convs[0]
Write-Host "ConversationID: $($conv._id)" -ForegroundColor Green
Write-Host "Participants: $($conv.participants -join ', ')" -ForegroundColor Gray

Write-Host "`n[3] INSTRUCTIONS FOR TESTING:" -ForegroundColor Cyan
Write-Host "  1. Open browser and login as b@b.com" -ForegroundColor White
Write-Host "  2. Stay on a page OTHER than /chat (e.g., dashboard, discover)" -ForegroundColor White
Write-Host "  3. Wait for this script to send a message..." -ForegroundColor White
Write-Host "  4. You should see a TOAST NOTIFICATION at the top-right" -ForegroundColor White
Write-Host "  5. You should hear a NOTIFICATION SOUND" -ForegroundColor White

Write-Host "`nPress Enter when ready to send test message..." -ForegroundColor Yellow
Read-Host

# Send message via HTTP (simulating WebSocket message)
Write-Host "`n[4] Sending test message from e@e.com to b@b.com..." -ForegroundColor Yellow

try {
    # We need to use the chat service HTTP endpoint (not available directly, so we'll use a workaround)
    Write-Host "NOTE: To fully test, send a message from the chat UI or use Socket.io client" -ForegroundColor Yellow
    Write-Host "The backend will emit 'new_message' event which the frontend will receive" -ForegroundColor White

    Write-Host "`nAlternative test:" -ForegroundColor Cyan
    Write-Host "1. Open browser as e@e.com" -ForegroundColor White
    Write-Host "2. Go to /chat and send a message to b@b.com" -ForegroundColor White
    Write-Host "3. On another browser/tab logged in as b@b.com (NOT on /chat page)" -ForegroundColor White
    Write-Host "4. The notification should appear!" -ForegroundColor White

} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n✓ Setup complete! Test messaging between users." -ForegroundColor Green

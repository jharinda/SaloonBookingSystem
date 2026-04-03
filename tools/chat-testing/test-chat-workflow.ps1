# SnapSalon Chat Workflow Test Script
Write-Host "=== SnapSalon Chat Workflow Test ===" -ForegroundColor Cyan

# Configuration
$apiUrl = "http://localhost:3000/api"
$chatUrl = "http://localhost:3009/api"
$clientEmail = "e@e.com"
$clientPassword = "Janith1111*"
$salonOwnerEmail = "z@z.com"
$salonOwnerPassword = "Janith1111*"

# Step 1: Login as client
Write-Host "[1/7] Logging in as client..." -ForegroundColor Yellow
try {
    $clientLoginBody = @{ email = $clientEmail; password = $clientPassword } | ConvertTo-Json
    $clientAuth = Invoke-RestMethod -Uri "$apiUrl/auth/login" -Method POST -Body $clientLoginBody -ContentType "application/json"
    $clientToken = $clientAuth.accessToken
    $clientId = $clientAuth.user._id
    Write-Host "   OK: Client logged in (ID: $clientId)" -ForegroundColor Green
} catch {
    Write-Host "   ERROR: Client login failed" -ForegroundColor Red
    exit 1
}

# Step 2: Login as salon owner
Write-Host "[2/7] Logging in as salon owner..." -ForegroundColor Yellow
try {
    $salonOwnerLoginBody = @{ email = $salonOwnerEmail; password = $salonOwnerPassword } | ConvertTo-Json
    $salonOwnerAuth = Invoke-RestMethod -Uri "$apiUrl/auth/login" -Method POST -Body $salonOwnerLoginBody -ContentType "application/json"
    $salonOwnerToken = $salonOwnerAuth.accessToken
    $salonOwnerId = $salonOwnerAuth.user._id
    $salonId = $salonOwnerAuth.user.salonId
    Write-Host "   OK: Salon owner logged in (Salon ID: $salonId)" -ForegroundColor Green
} catch {
    Write-Host "   ERROR: Salon owner login failed" -ForegroundColor Red
    exit 1
}

# Step 3: Create conversation
Write-Host "[3/7] Creating conversation..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $clientToken"; "Content-Type" = "application/json" }
    $createConvBody = @{ salonId = $salonId } | ConvertTo-Json
    $conversation = Invoke-RestMethod -Uri "$chatUrl/chat/conversations" -Method POST -Headers $headers -Body $createConvBody
    $conversationId = $conversation._id
    Write-Host "   OK: Conversation created (ID: $conversationId)" -ForegroundColor Green
} catch {
    Write-Host "   ERROR: Conversation creation failed" -ForegroundColor Red
    exit 1
}

# Step 4: Get salon owner conversations
Write-Host "[4/7] Fetching salon owner conversations..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $salonOwnerToken" }
    $salonConversations = Invoke-RestMethod -Uri "$chatUrl/chat/conversations" -Method GET -Headers $headers
    $foundConv = $salonConversations | Where-Object { $_._id -eq $conversationId }
    if ($foundConv) {
        Write-Host "   OK: Salon owner can see the conversation" -ForegroundColor Green
    } else {
        Write-Host "   ERROR: Salon owner cannot see the conversation" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ERROR: Failed to fetch salon conversations" -ForegroundColor Red
    exit 1
}

# Step 5: Get conversation messages
Write-Host "[5/7] Fetching conversation messages..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $clientToken" }
    $messages = Invoke-RestMethod -Uri "$chatUrl/chat/conversations/$conversationId/messages" -Method GET -Headers $headers
    Write-Host "   OK: Retrieved $($messages.total) messages" -ForegroundColor Green
} catch {
    Write-Host "   ERROR: Failed to fetch messages" -ForegroundColor Red
   exit 1
}

# Step 6: WebSocket check
Write-Host "[6/7] WebSocket integration check..." -ForegroundColor Yellow
Write-Host "   INFO: WebSocket events (test manually in browser)" -ForegroundColor Cyan
Write-Host "      - Connect to ws://localhost:3009/chat" -ForegroundColor Gray
Write-Host "      - Emit join_conversation, send_message events" -ForegroundColor Gray

# Step 7: Test notification endpoint
Write-Host "[7/7] Testing notification service..." -ForegroundColor Yellow
try {
    $notificationUrl = "http://localhost:3004/api/notifications/push"
    $notifBody = @{
        userId = $salonOwnerId
        title = "Test Chat Notification"
        body = "New message from test client"
        data = @{ type = "new_message"; conversationId = $conversationId; senderId = $clientId }
    } | ConvertTo-Json
    $notifResult = Invoke-RestMethod -Uri $notificationUrl -Method POST -Body $notifBody -ContentType "application/json"
    if ($notifResult.sent) {
        Write-Host "   OK: Notification service working" -ForegroundColor Green
    } else {
        Write-Host "   WARN: Notification sent but may not be delivered" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   WARN: Notification test failed (FCM not configured)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Test Summary ===" -ForegroundColor Cyan
Write-Host "Chat API: Working" -ForegroundColor Green
Write-Host "Conversation creation: Working" -ForegroundColor Green
Write-Host "Message retrieval: Working" -ForegroundColor Green
Write-Host ""
Write-Host "To test real-time messaging:" -ForegroundColor Cyan
Write-Host "  1. Open http://localhost:4200 as client ($clientEmail)" -ForegroundColor White
Write-Host "  2. Navigate to salon and click Message button" -ForegroundColor White
Write-Host "  3. Open another browser as salon owner ($salonOwnerEmail)" -ForegroundColor White
Write-Host "  4. Go to Messages page" -ForegroundColor White
Write-Host "  5. Send messages and verify real-time delivery" -ForegroundColor White
Write-Host ""


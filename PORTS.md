# SnapSalon Port Management

## Killing Processes on Service Ports

When you encounter `EADDRINUSE` errors (port already in use), you can kill all processes running on SnapSalon service ports using either method:

### Method 1: NPM Script (Recommended)
```bash
npm run kill-ports
```

### Method 2: Batch File (Double-click)
Simply double-click `kill-ports.bat` in the project root.

### Method 3: Manual PowerShell Command
```powershell
$ports = @(3000,3001,3002,3003,3004,3005,3006,3007,3008,3009,4200)
foreach($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if($connections) {
        $connections | ForEach-Object {
            $processId = $_.OwningProcess
            Write-Host "Killing process $processId on port $port" -ForegroundColor Yellow
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }
}
Write-Host "All ports cleared!" -ForegroundColor Green
```

## Ports Used

| Port | Service |
|------|---------|
| 3000 | API Gateway |
| 3001 | Salon Service |
| 3002 | Booking Service |
| 3003 | Auth Service |
| 3004 | Notification Service |
| 3005 | Calendar Service |
| 3006 | Review Service |
| 3007 | Subscription Service |
| 3008 | User Service |
| 3009 | Chat Service |
| 4200 | Frontend (Angular) |

## Individual Port Killing

To kill a specific port manually:
```powershell
# Find process using the port
netstat -ano | findstr ":<PORT>"

# Kill the process (replace <PID> with the actual process ID)
taskkill /F /PID <PID>
```

Example:
```powershell
# Find process on port 3003
netstat -ano | findstr ":3003"

# Kill process (if PID is 12345)
taskkill /F /PID 12345
```

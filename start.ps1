# Kill existing processes to free up ports
Write-Host "Cleaning up existing processes..." -ForegroundColor Yellow
Stop-Process -Name "node" -ErrorAction SilentlyContinue
Stop-Process -Name "python" -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start Backend Server
Write-Host "Starting Backend Server..." -ForegroundColor Cyan
Start-Process powershell -WorkingDirectory "$PSScriptRoot\backend" -ArgumentList "-NoExit", "-Command", "npm.cmd start"

# Start Frontend Application
Write-Host "Starting Frontend Application..." -ForegroundColor Cyan
Start-Process powershell -WorkingDirectory "$PSScriptRoot\frontend" -ArgumentList "-NoExit", "-Command", "npm.cmd run dev"

# Start Python Engine
Write-Host "Starting Python Analysis Engine..." -ForegroundColor Cyan
Start-Process powershell -WorkingDirectory "$PSScriptRoot" -ArgumentList "-NoExit", "-Command", ".\.venv\Scripts\python.exe engine/bridge.py"

Write-Host "All services started!" -ForegroundColor Green
Write-Host "Frontend: http://localhost:3000"
Write-Host "Backend:  http://localhost:4000"

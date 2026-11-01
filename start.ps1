$env:ELECTRON_RUN_AS_NODE = "1"
Write-Host "Starting PeerNest Platform on http://localhost:3000 ..." -ForegroundColor Green
& "C:\Users\annbo\AppData\Local\Programs\antigravity\Antigravity.exe" server/index.js

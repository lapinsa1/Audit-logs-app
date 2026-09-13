@echo off
title SAP CDC Audit Logs Server
cd /d "C:\Users\lapin\Development\APPS\sap-audit-app"

echo Starting server...
:: Wait 1 second then open browser automatically
timeout /t 1 /nobreak >nul
start http://localhost:3000

:: Run the Node server (keeps window open for terminal debug logs)
node server.js
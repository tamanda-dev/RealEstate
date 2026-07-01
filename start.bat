@echo off
echo Starting Real Estate App...

echo.
echo [1/2] Starting Django backend on http://localhost:8000
start "Django Backend" cmd /k "cd /d "%~dp0" && venv\Scripts\python manage.py runserver"

timeout /t 3 /nobreak >nul

echo [2/2] Starting React frontend on http://localhost:3000
start "React Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo App is starting:
echo   Backend API:   http://localhost:8000/api/
echo   Frontend:      http://localhost:3000
echo   Admin panel:   http://localhost:8000/admin/
echo.
pause

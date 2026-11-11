@echo off
REM Cai doi subagent + skill mobile vao .claude cua du an ZaloCRM-CorepViet
REM Chay 1 lan: double-click hoac chay trong thu muc goc du an.
setlocal
cd /d "%~dp0.."
if not exist ".claude" mkdir ".claude"
robocopy "claude-setup\skills"   ".claude\skills"   /E /NFL /NDL /NJH /NJS
robocopy "claude-setup\agents"   ".claude\agents"   /E /NFL /NDL /NJH /NJS
robocopy "claude-setup\commands" ".claude\commands" /E /NFL /NDL /NJH /NJS
echo.
echo Da cai xong. Mo Claude Code trong thu muc du an, go /agents de kiem tra.
pause

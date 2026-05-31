@echo off
echo.
echo  Setting up Windows Firewall for LERMO...
echo  (Run as Administrator)
echo.
netsh advfirewall firewall add rule name="LERMO Chat Server" dir=in action=allow protocol=TCP localport=8888
echo.
echo  Firewall rule added! Port 8888 is now open.
echo  Others on your Wi-Fi can now connect to LERMO.
echo.
pause

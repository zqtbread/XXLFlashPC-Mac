property profileName : "XXLFlashPC"

on run
	set myPath to POSIX path of (path to me)
	set electronApp to myPath & "Contents/Resources/runtime/Electron.app"
	set profileDir to (POSIX path of (path to home folder)) & "Library/Application Support/" & profileName
	try
		do shell script "mkdir -p " & quoted form of profileDir
		do shell script "xattr -cr " & quoted form of electronApp & " 2>/dev/null || true"
		set cmd to "open -a " & quoted form of electronApp & " --args --no-sandbox --user-data-dir=" & quoted form of profileDir
		do shell script cmd
	on error errMsg
		display dialog "启动失败：" & errMsg buttons {"好"} default button 1 with icon caution
	end try
end run

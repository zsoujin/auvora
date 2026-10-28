# Installation

auvora targets Windows 10/11 x64. Installers are distributed through [GitHub Releases](https://github.com/zsoujin/auvora/releases). A release is available only when its assets appear on that page; source preparation does not imply a published release.

1. Download `auvora_<version>_x64-setup.exe` and `SHA256SUMS.txt` from the same release.
2. In PowerShell, run `Get-FileHash .\auvora_<version>_x64-setup.exe -Algorithm SHA256` and compare the result with the checksum file.
3. Run the installer. It installs for the current Windows user and includes the audio tools and an offline WebView2 installer. Node.js, Rust and Python are not required.
4. Open auvora and select **Import** to add local audio.

Current builds are unsigned. Windows may display an unknown-publisher or SmartScreen warning. Check the release source and checksum before deciding whether to run the file. A checksum detects a changed download; it is not a publisher signature.

## Updates and removal

Close auvora before installing a newer version. Library data is separate from the installation directory. Back up the library in **Settings**, and copy your audio files separately before updating.

The compatibility identifier remains `app.personalaudio.desktop`, so existing libraries remain at `%APPDATA%\app.personalaudio.desktop\library.sqlite3`. Do not remove this directory when retaining your library. If the uninstaller offers to remove application data, leave that option unchecked. Imported and downloaded audio files are stored outside the installation directory.

Clean Windows 10/11 installation and uninstall behavior still require validation on separate machines. See [known limitations](limitations.md) for the current verification limits.

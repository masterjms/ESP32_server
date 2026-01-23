[Setup]
AppName=Audio Server Controller
AppVersion=1.0
AppPublisher=minsung
DefaultDirName={autopf}\AudioServer
DefaultGroupName=Audio Server Controller
OutputBaseFilename=AudioServer_Setup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
Source: "C:\Users\mstot\audio_server\AudioServer_v1.0\server.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "C:\Users\mstot\audio_server\AudioServer_v1.0\mic_sender.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "C:\Users\mstot\audio_server\AudioServer_v1.0\ffmpeg.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "C:\Users\mstot\audio_server\AudioServer_v1.0\public\*"; DestDir: "{app}\public"; Flags: recursesubdirs createallsubdirs
Source: "C:\Users\mstot\audio_server\AudioServer_v1.0\media\*"; DestDir: "{app}\media"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Audio Server Controller"; Filename: "{app}\server.exe"
Name: "{commondesktop}\Audio Server Controller"; Filename: "{app}\server.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\server.exe"; Description: "Run Audio Server Controller"; Flags: nowait postinstall skipifsilent

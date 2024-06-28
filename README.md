# RoTracker
 
RoTracker is a Chrome extension that enables users to track the playtime of other Roblox players. While Roblox does not natively support this feature and no online metric services currently offer it, RoTracker fills this gap. The extension takes advantage of changes in Roblox's friend API to monitor playtime in real-time. It achieves this by collecting data through an external server hosted on the user's localhost, which makes requests to the Roblox friends API. The collected data is then used to calculate a player's playtime, as well as several more little metrics mentioned below, even when Chrome is closed.
## Features
#### General
- Clean and simple Chrome extention
- Light weight server executable made in Rust
- Detailed indivisual metrics

#### Metrics
- Total time online
- Total time in games
- Total time in studio
- Visited places
- Total time in a Roblox place
- Last time in a Roblox place



## Installation

There are two things needed to use this software: the [Chrome extention](https://linktodocumentation) and the [server](https://linktodocumentation). The server must be running in order to view player information in the extension, as well as track play times. RoTracker will keep track of player data as long as the server is running, even when Google Chrome is closed.



    
### RoTracker Chrome Extension 
Becuase I don't want to pay the $5 ([I'm broke](https://cash.app/$Gotzya808)) to upload this to the Chrome Web Store, you will need to unpack it.

1. Install the extension files [here](https://github.com/Gotzya/RoTracker/releases/tag/v1.0.0)
2. Unzip the folder 
3. Load the folder as an unpacked Chrome extension in the Manage Extensions page in Google's settings. Be sure to enable Developer Mode in order to see the loading options. [[Video Help](https://www.youtube.com/watch?v=vSzaXLYTSUY)]
   
   ![App Screenshot](screenshots/Loading_chrome_extension.png)
5. Pin the extension for ease-of-access
   
   ![App Screenshot](screenshots/RoTracker_pinned.png)

### Rotracker Server
The server is very light-weight and opens up in a terminal from an executable

1. Install the server files [here](https://github.com/Gotzya/RoTracker/releases/tag/v1.0.0)
2. Unzip the folder 
3. Double click on "backend_rust.exe" to run the server
   
   ![App Screenshot](screenshots/RoTracker_server_exe.png)
## Usage

cont...

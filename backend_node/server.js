import {fileURLToPath} from 'url';
import {dirname, join} from 'path';
import {config as dotenvConfig} from 'dotenv';
import {resolve} from 'path';
import fs from 'fs';
import axios from 'axios';
import dotenv from 'dotenv';
import cron from 'node-cron';
import dayjs from 'dayjs';
import express from 'express';
import cors from 'cors';
import chalk from 'chalk';

let trackedProfiles = [];
let user_ID;
let auth_ID;
let API = express();

API.use(cors());
API.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const playerDataDir = join(__dirname, 'player_data');

async function start() {
    console.log(chalk.blue("Starting server..."));

    dotenv.config();
    dotenvConfig({ path: resolve(__dirname, '.env') });

    auth_ID = process.env.ROBLOX_COOKIE;
    user_ID = process.env.USER_ROBLOX_ID;

    if (!fs.existsSync(playerDataDir)) {
        fs.mkdirSync(playerDataDir);
    }

    repopulateLocalStorage(user_ID);

    API.listen(3000, () => console.log(chalk.green("API running...")));
    cron.schedule('* * * * *', update);
    console.log(chalk.green("Server running..."));
}

API.post("/set_auth_cookie", (req, res) => {
    const content = req.body;
    if (!content) {
        return res.status(400).send("New auth cookie not provided.");
    }
    
    try {
        const envConfig = dotenv.parse(fs.readFileSync('.env'));

        envConfig["ROBLOX_COOKIE"] = content.AUTH_COOKIE;
        auth_ID = content.AUTH_COOKIE;

        fs.writeFileSync('.env', Object.entries(envConfig).map(([key, value]) => `${key}=${value}`).join('\n'));

        res.sendStatus(200);
    } catch (error) {
        console.error("Error updating auth cookie:", error);
        res.status(500).send("Internal Server Error");
    }
});

API.get("/get_auth_cookie", (req, res) => {
    try {
        res.status(200).json({ "AUTH_COOKIE": auth_ID });
    } catch (error) {
        console.error("Error retrieving auth cookie:", error);
        res.status(500).send("Internal Server Error");
    }
});

API.post("/set_user_id", (req, res) => {
    const content = req.body;
    if (!content) {
        return res.status(400).send("New user ID not provided.");
    }
    
    try {
        const envConfig = dotenv.parse(fs.readFileSync('.env'));

        envConfig["USER_ROBLOX_ID"] = content.USER_ROBLOX_ID;
        user_ID = content.USER_ROBLOX_ID;

        fs.writeFileSync('.env', Object.entries(envConfig).map(([key, value]) => `${key}=${value}`).join('\n'));

        res.sendStatus(200);
    } catch (error) {
        console.error("Error updating user ID:", error);
        res.status(500).send("Internal Server Error");
    }
});

API.get("/get_user_id", (req, res) => {
    try {
        res.status(200).json({ "USER_ID": user_ID });
    } catch (error) {
        console.error("Error retrieving user ID:", error);
        res.status(500).send("Internal Server Error");
    }
});


API.post("/track_player", (req, res) => {
    let content = req.body;
    if (!content) {
        return res.sendStatus(400);
    }

    addProfileToTrackedArray(content.user_ID, content.player_ID);
    res.sendStatus(201);
});

API.post("/untrack_player", (req, res) => {
    let content = req.body;
    if (!content) {
        return res.sendStatus(400);
    }

    removeProfileFromArray(trackedProfiles, content.player_ID);
    res.sendStatus(201);
});

API.get("/get_tracked_players", (req, res) => {
    res.json(trackedProfiles);
});

async function update() {
    if (trackedProfiles.length == 0) {
        console.log(chalk.red("No profiles to track..."));
        return;
    }

    for (let i = 0; i < trackedProfiles.length; i++) {
        let friend_profile_info = await getFriendInformation(user_ID, trackedProfiles[i].player_ID);
        if (friend_profile_info == "friend not online") {
            updatePlayerOffline(trackedProfiles[i], friend_profile_info);
            continue;
        }

        switch (friend_profile_info.userPresence.UserPresenceType) {
            case "Online":
                updatePlayerOnline(trackedProfiles[i], friend_profile_info);
                break;
            case "InGame":
                updatePlayerInGame(trackedProfiles[i], friend_profile_info);
                break;
            case "InStudio":
                updatePlayerInStudio(trackedProfiles[i], friend_profile_info);
                break;
            default:
                updatePlayerOffline(trackedProfiles[i], friend_profile_info);
                break;
        }
    } 
}

class Profile {
    constructor(player_ID) {
        this.player_ID = player_ID;
        this.player_username = "Not Yet Online";
        this.player_display_name;

        this.player_status = "Offline";
        this.last_player_status = "Offline";

        this.player_last_online;
        this.minutes_online = 0;
        this.minutes_in_game = 0;
        this.minutes_in_studio = 0;

        this.place_visits = [];
        this.current_game_ID;
    }
}

class PlaceVisit {
    constructor(place_ID, place_name) {
        this.place_ID = place_ID;
        this.place_name = place_name;
        this.time_played = 0;
        this.last_played;
    }
}

async function repopulateLocalStorage(user_ID) {
    let stored_player_IDs = await getPlayerIDsFromFileSystem();

    if (stored_player_IDs.length == 0) {
        console.log(chalk.red("No profiles to populate!"));
        return;
    }

    for (let i = 0; i < stored_player_IDs.length; i++) {
        await readdProfileToTrackedArray(
            user_ID,
            stored_player_IDs[i].player_ID,
            stored_player_IDs[i].player_username,
            stored_player_IDs[i].player_display_name,
            stored_player_IDs[i].player_last_online,
            stored_player_IDs[i].minutes_online,
            stored_player_IDs[i].minutes_in_game
        );
    }

    console.log(trackedProfiles);
}

function getPlayerIDsFromFileSystem() {
    return new Promise((resolve, reject) => {
        fs.readdir(playerDataDir, (err, files) => {
            if (err) {
                return reject(err);
            }

            const playerData = files.map(file => {
                const filePath = join(playerDataDir, file);
                return JSON.parse(fs.readFileSync(filePath, 'utf8'));
            });

            resolve(playerData);
        });
    });
}

function writePlayerData(playerId, data, callback) {
    const filePath = join(playerDataDir, `${playerId}.json`);
    fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8', callback);
}

function readPlayerData(playerId, callback) {
    const filePath = join(playerDataDir, `${playerId}.json`);
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return callback(err, null);
        }
        callback(null, JSON.parse(data));
    });
}

function updatePlayerOnline(tracking_profile, profile_info) {
    tracking_profile.last_player_status = tracking_profile.player_status;
    tracking_profile.player_status = "Online";

    tracking_profile.player_last_online = dayjs().format("YYYY-MM-DD HH:mm:ss");
    tracking_profile.minutes_online += 1;

    writePlayerData(tracking_profile.player_ID, tracking_profile, (err) => {
        if (err) {
            console.error(err);
        }
    });
}

function updatePlayerInGame(tracking_profile, profile_info) {
    tracking_profile.last_player_status = tracking_profile.player_status;
    tracking_profile.player_status = "InGame";

    tracking_profile.player_last_online = dayjs().format("YYYY-MM-DD HH:mm:ss");
    tracking_profile.minutes_online += 1;
    tracking_profile.minutes_in_game += 1;

    if (newPlaceVisit(tracking_profile.place_visits, profile_info.userPresence.placeId)) {
        let new_place_visit = new PlaceVisit(profile_info.userPresence.placeId, profile_info.userPresence.lastLocation);
        new_place_visit.time_played += 1;
        tracking_profile.place_visits.push(new_place_visit);
    } else {
        for (let i = 0; i < tracking_profile.place_visits.length; i++) {
            if (tracking_profile.place_visits[i].place_ID != profile_info.userPresence.placeId) continue;

            let current_game = tracking_profile.place_visits[i];
            current_game.time_played += 1;
            current_game.last_played = dayjs().format("YYYY-MM-DD HH:mm:ss");
            tracking_profile.current_game_ID = profile_info.userPresence.placeId;
            break;
        }
    }

    writePlayerData(tracking_profile.player_ID, tracking_profile, (err) => {
        if (err) {
            console.error(err);
        }
    });
}

function updatePlayerOffline(tracking_profile, profile_info) {
    tracking_profile.last_player_status = tracking_profile.player_status;
    tracking_profile.player_status = "Offline";
    if (tracking_profile.current_game_ID > 0) tracking_profile.current_game_ID = -1;

    writePlayerData(tracking_profile.player_ID, tracking_profile, (err) => {
        if (err) {
            console.error(err);
        }
    });
}

function updatePlayerInStudio(tracking_profile, profile_info) {
    tracking_profile.last_player_status = tracking_profile.player_status;
    tracking_profile.player_status = "InStudio";

    tracking_profile.player_last_online = dayjs().format("YYYY-MM-DD HH:mm:ss");
    tracking_profile.minutes_online += 1;
    tracking_profile.minutes_in_studio += 1;

    writePlayerData(tracking_profile.player_ID, tracking_profile, (err) => {
        if (err) {
            console.error(err);
        }
    });
}

function newPlaceVisit(place_visit_array, place_ID) {
    for (let i = 0; i < place_visit_array.length; i++) {
        if (place_visit_array[i].place_ID == place_ID) return false;
    }

    return true;
}

async function readdProfileToTrackedArray(owner_ID, player_ID, player_username, player_display_name, player_last_online, minutes_online, minutes_in_game) {
    if (!checkFrendship(owner_ID, player_ID)) {
        console.log("not friends");
        return;
    }

    if (playerInArray(trackedProfiles, player_ID)) {
        console.log("profile already tracked");
        return;
    }

    let friend_profile = await getFriendInformation(owner_ID, player_ID);
    let profile = new Profile(player_ID);

    profile.player_username = player_username;
    profile.player_display_name = player_display_name;
    profile.player_status = "Offline";

    let currentStatis;
    try {
        currentStatis = friend_profile.userPresence.UserPresenceType;
    } catch { }
    if (currentStatis == "Online") {
        profile.player_last_online = dayjs().format("YYYY-MM-DD HH:mm:ss");
        profile.player_status = "Online";
    } else if (currentStatis == "InGame") {
        profile.player_last_online = dayjs().format("YYYY-MM-DD HH:mm:ss");
        profile.player_status = "InGame";
    } else if (currentStatis == "InStudio") {
        profile.player_last_online = dayjs().format("YYYY-MM-DD HH:mm:ss");
        profile.player_status = "InStudio";
    } 

    profile.player_last_online = player_last_online;
    profile.minutes_online = minutes_online;
    profile.minutes_in_game = minutes_in_game;

    let stored_player_visits = await getPlayerVisitsFromFileSystem(player_ID);

    for (let i = 0; i < stored_player_visits.length; i++) {
        let visit = new PlaceVisit(
            stored_player_visits[i].place_ID,
            stored_player_visits[i].place_name
        );

        visit.time_played = stored_player_visits[i].time_played;
        visit.last_played = stored_player_visits[i].last_played;

        profile.place_visits.push(visit);
    }

    trackedProfiles.push(profile);

    console.log(chalk.cyan(`readded ${profile.player_username} (${profile.player_ID})`));
    console.log(chalk.cyan(`current status: ${profile.player_status}`));
}

function getPlayerVisitsFromFileSystem(player_ID) {
    return new Promise((resolve, reject) => {
        const filePath = join(playerDataDir, `${player_ID}.json`);
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                return reject(err);
            }
            const profileData = JSON.parse(data);
            resolve(profileData.place_visits || []);
        });
    });
}

async function addProfileToTrackedArray(owner_ID, player_ID) {
    if (!checkFrendship(owner_ID, player_ID)) {
        console.log("not friends");
        return;
    }

    if (playerInArray(trackedProfiles, player_ID)) {
        console.log("profile already tracked");
        return;
    }

    let friend_profile = await getFriendInformation(owner_ID, player_ID);
    let profile = new Profile(player_ID);

    profile.player_username = friend_profile.name;
    profile.player_display_name = friend_profile.displayName;

    if (friend_profile.displayName == undefined)  profile.player_display_name = "Not Yet Online"
    profile.player_status = "Offline";

    let currentStatis;
    try {
        currentStatis = friend_profile.userPresence.UserPresenceType;
    } catch { }

    if (currentStatis == "Online") {
        profile.player_last_online = dayjs().format("YYYY-MM-DD HH:mm:ss");
        profile.player_status = "Online";
    } else if (currentStatis == "InGame") {
        profile.player_last_online = dayjs().format("YYYY-MM-DD HH:mm:ss");
        profile.player_status = "InGame";
    }

    writePlayerData(profile.player_ID, profile, (err) => {
        if (err) {
            console.error(err);
            return;
        }
    });

    trackedProfiles.push(profile);

    console.log(chalk.cyan(`added ${profile.player_username} (${profile.player_ID})`));
    console.log(chalk.cyan(`current status: ${profile.player_status}`));
}

function removeProfileFromArray(array, player_ID) {
    for (let i = 0; i < array.length; i++) {
        if (array[i].player_ID == player_ID) {
            const filePath = join(playerDataDir, `${player_ID}.json`);
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error(err);
                    return;
                }
            });
            array.splice(i, 1);
            return;
        }
    }
}

async function getFriendInformation(owner_ID, player_ID) {
    let friends_online = await getPlayerFriendsOnline(owner_ID);
    try {
        for (let i = 0; i < friends_online.length; i++) {
            if (friends_online[i].id != player_ID) continue;
            return friends_online[i];
        }
        return "friend not online";
    } catch {
        console.log("that shit be buggin fr")
    }

}

function playerInArray(playerArray, player_ID) {
    for (let i = 0; i < playerArray.length; i++) {
        if (playerArray[i].player_ID == player_ID) {
            return true;
        }
    }

    return false;
}

async function getPlayerFriendsOnline(player_ID) {
    try {
        const response = await axios.get(`https://friends.roblox.com/v1/users/${player_ID}/friends/online`, {
            headers: {
                'accept': 'application/json',
                'cookie': `.ROBLOSECURITY=${auth_ID}`
            }
        });
        return response.data.data;
    } catch (error) {
        console.error("Error fetching data:", error);
        return null;
    }
}

async function checkFrendship(owner_ID, player_ID) {
    try {
        const response = await axios.get(`https://friends.roblox.com/v1/users/${owner_ID}/friends/statuses?userIds=${player_ID}`, {
            headers: {
                'accept': 'application/json',
                'cookie': `.ROBLOSECURITY=${auth_ID}`
            }
        });

        return (response.data.data[0].status === "Friends");
    } catch (error) {
        console.error("Error fetching data:", error);
        return null;
    }
}

start();
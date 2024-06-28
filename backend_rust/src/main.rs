#![allow(non_snake_case)]
extern crate chrono;
extern crate tokio;
extern crate lazy_static;
extern crate dotenv;

use actix_web::{get, post, web, App, HttpServer, HttpResponse, Responder};
use reqwest::{Client, Error, Response};
use serde::{Deserialize, Serialize};
use tokio::time::{sleep, Duration};
use std::path::{PathBuf, Path};
use lazy_static::lazy_static;
use std::sync::{Arc, Mutex};
use std::io::{Read, Write};
use chrono::prelude::*;
use actix_cors::Cors;
use serde_json::json;
use dotenv::dotenv;
use std::fs::File;
use std::env;
use std::fs;

const SERVER_TPS: u64 = 60;
lazy_static! {
    static ref TRACKED_PLAYER_ARRAY: Arc<Mutex<Vec<Profile>>> = Arc::new(Mutex::new(Vec::new()));
    static ref TRACKED_USER_ID: Arc<Mutex<u64>> = Arc::new(Mutex::new(0));
    static ref CURRENT_AUTH_COOKIE: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
}

enum ProfileStatus {
    Offline,
    Online,
    InGame,
    InStudio,
    Unknown,
}

impl ToString for ProfileStatus {
    fn to_string(&self) -> String {
        match self {
            ProfileStatus::Offline => "Offline".to_string(),
            ProfileStatus::Online => "Online".to_string(),
            ProfileStatus::InGame => "InGame".to_string(),
            ProfileStatus::InStudio => "InStudio".to_string(),
            ProfileStatus::Unknown => "Unknown".to_string(),
        }
    }
}

impl TryFrom<String> for ProfileStatus {
    type Error = ();

    fn try_from(value: String) -> Result<Self, Self::Error> {
        match value.as_str() {
            "Offline" => Ok(ProfileStatus::Offline),
            "Online" => Ok(ProfileStatus::Online),
            "InGame" => Ok(ProfileStatus::InGame),
            "InStudio" => Ok(ProfileStatus::InStudio),
            _ => Ok(ProfileStatus::Unknown),
        }
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
struct Profile {
    player_id: u64,
    player_username: String,
    player_display_name: String,
    player_status: String,
    last_player_status: String,
    player_last_online: String,
    minutes_online: u32,
    minutes_in_game: u32,
    minutes_in_studio: u32,
    place_visits: Vec<PlaceVisit>,
    current_game_id: Option<u64>,
    dated_added: String,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
struct PlaceVisit {
    place_id: u64,
    place_name: String,
    time_played: u32,
    last_played: String,
}

#[tokio::main]
async fn main() {
    dotenv().ok();
    load_env_variables();
    load_tracked_players();
    
    println!("Starting collection server...");
    let main_tracking_thread = tokio::spawn(async move {
        loop {
            let _ = update(TRACKED_PLAYER_ARRAY.clone(), TRACKED_USER_ID.clone()).await;
            sleep(Duration::from_secs(SERVER_TPS)).await;
        }
    });
    println!("Collection server running!");

    println!("Starting API server running...");
    let main_web_api_thread = tokio::spawn(async move {
        _ = HttpServer::new(|| {
            let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

            App::new()
            .wrap(cors)
            .service(track_player)
            .service(untrack_player)
            .service(set_user_id)
            .service(set_auth_cookie)
            .service(get_auth_cookie)
            .service(get_user_id)
            .service(get_tracked_players)
        })
        .bind(("127.0.0.1", 3000)).unwrap()
        .run()
        .await;
    });
    println!("API server running!");
    println!("Running on 127.0.0.1:3000");

    main_tracking_thread.await.unwrap();
    main_web_api_thread.await.unwrap();
}

#[derive(Deserialize)]
struct AuthCookiePayload {
	cookie: String,
}

#[post("/set_auth_cookie")]
async fn set_auth_cookie(player_data: web::Json<AuthCookiePayload>) -> impl Responder {
    *(CURRENT_AUTH_COOKIE.lock().unwrap()) = player_data.cookie.clone();
    save_env_variable("AUTH_COOKIE", &player_data.cookie.clone());
    println!("Set auth cookie to: {}", player_data.cookie);
    format!("Set auth cookie to: {}", player_data.cookie)
}

#[derive(Deserialize)]
struct UserIDPayload {
	user_id: u64,
}

#[post("/set_user_id")]
async fn set_user_id(player_data: web::Json<UserIDPayload>) -> impl Responder {
    *(TRACKED_USER_ID.lock().unwrap()) = player_data.user_id;
    save_env_variable("USER_ID", &player_data.user_id.to_string());
    println!("Set user ID to: {}", &player_data.user_id);
    format!("Set user ID to: {}", &player_data.user_id)
}

#[derive(Deserialize)]
struct TrackPlayerPayload {
	user_ID: u64,
	player_ID: u64,
}

#[post("/track_player")]
async fn track_player(player_data: web::Json<TrackPlayerPayload>) -> impl Responder {
    add_player_to_tracked_array(
        player_data.user_ID,
        player_data.player_ID,
        TRACKED_PLAYER_ARRAY.clone(),
    ).await;
    format!("added player: {}", &player_data.player_ID)
}

#[post("/untrack_player")]
async fn untrack_player(player_data: web::Json<TrackPlayerPayload>) -> impl Responder {
    remove_profile_from_array(TRACKED_PLAYER_ARRAY.clone(), player_data.player_ID);
    format!("removed player: {}", &player_data.player_ID)
}

#[get("/get_auth_cookie")]
async fn get_auth_cookie() -> impl Responder {
    let auth_cookie = CURRENT_AUTH_COOKIE.lock().unwrap();
    HttpResponse::Ok().json(&json!({ "cookie": *auth_cookie }))
}

#[get("/get_user_id")]
async fn get_user_id() -> impl Responder {
    let user_id = TRACKED_USER_ID.lock().unwrap();
    HttpResponse::Ok().json(&json!({ "user_id": *user_id }))
}

#[get("/get_tracked_players")]
async fn get_tracked_players() -> impl Responder {
    let tracked_profiles = TRACKED_PLAYER_ARRAY.lock().unwrap();
    HttpResponse::Ok().json(&*tracked_profiles)
}

async fn update(
    player_array: Arc<Mutex<Vec<Profile>>>,
    user_id: Arc<Mutex<u64>>,
) -> Result<(), Error> {
    let mut current_profile_array: Vec<Profile> = player_array.lock().unwrap().clone();
    let current_player_id: u64 = user_id.lock().unwrap().clone();

    if current_player_id == 0 { // 0 is the value player_id is inisilized with
        let timestamp: DateTime<Local> = Local::now();

        println!(
            "[{}] {}",
            timestamp.format("%Y-%m-%d %H:%M:%S").to_string(),
            "User ID is not set!"
        );

        if CURRENT_AUTH_COOKIE.lock().unwrap().is_empty() {
            println!(
                "[{}] {}",
                timestamp.format("%Y-%m-%d %H:%M:%S").to_string(),
                "Roblox cookie is not set!"
            );
            return Ok(());
        }
        return Ok(());
    }

    if CURRENT_AUTH_COOKIE.lock().unwrap().is_empty() {
        let timestamp: DateTime<Local> = Local::now();
        println!(
            "[{}] {}",
            timestamp.format("%Y-%m-%d %H:%M:%S").to_string(),
            "Roblox cookie is not set!"
        );
        return Ok(());
    }

    
    if current_profile_array.is_empty() {
        let timestamp: DateTime<Local> = Local::now();
        println!(
            "[{}] {}",
            timestamp.format("%Y-%m-%d %H:%M:%S").to_string(),
            "No profiles to track..."
        );
        return Ok(());
    }

    let online_friends_array: Vec<FriendData> = get_player_friends_online(&current_player_id)
        .await
        .unwrap()
        .data;

    for profile in current_profile_array.iter_mut() {
        update_profile(profile, &online_friends_array).await.unwrap();
    }
        
    *(TRACKED_PLAYER_ARRAY.lock().unwrap()) = current_profile_array.clone();

    let timestamp: DateTime<Local> = Local::now();
    println!(
        "[{}] {}",
        timestamp.format("%Y-%m-%d %H:%M:%S").to_string(),
        format!("server updated {} profiles!", &current_profile_array.len())
    );
    Ok(())
}

async fn update_profile(
    profile: &mut Profile,
    online_friend_array: &Vec<FriendData>,
) -> Result<(), Error> {
    for friend_profile in online_friend_array.iter() {
        profile.last_player_status = profile.player_status.clone();
        profile.player_status = ProfileStatus::Offline.to_string();

        if profile.player_id != friend_profile.id {
            continue;
        }

        match friend_profile
            .userPresence
            .UserPresenceType
            .clone()
            .try_into()
            .unwrap()
        {
            ProfileStatus::Online => handle_online_status(profile, friend_profile).await,
            ProfileStatus::InGame => handle_in_game_status(profile, friend_profile).await,
            ProfileStatus::InStudio => handle_in_studio_status(profile, friend_profile).await,
            _ => {}
        }

        _ = write_player_data(profile.player_id.clone(), profile);
        return Ok(());
    }

    _ = write_player_data(profile.player_id.clone(), profile);

    Ok(())
}

async fn handle_online_status(profile: &mut Profile, friend_profile: &FriendData) {
    let timestamp: DateTime<Local> = Local::now();
    
    profile.player_username = friend_profile.name.clone();
    profile.player_display_name = friend_profile.displayName.clone();
    profile.last_player_status = profile.player_status.clone();
    profile.player_status = ProfileStatus::Online.to_string();
    profile.player_last_online = timestamp.format("%Y-%m-%dT%H:%M:%SZ").to_string();
    profile.minutes_online += 1;
}

async fn handle_in_game_status(profile: &mut Profile, friend_profile: &FriendData) {
    let timestamp: DateTime<Local> = Local::now();

    profile.last_player_status = profile.player_status.clone();
    profile.player_username = friend_profile.name.clone();
    profile.player_display_name = friend_profile.displayName.clone();
    profile.player_status = ProfileStatus::InGame.to_string();
    profile.player_last_online = timestamp.format("%Y-%m-%dT%H:%M:%SZ").to_string();
    profile.minutes_online += 1;
    profile.minutes_in_game += 1;

    let if_new_visit = match new_place_visit(&profile.place_visits, friend_profile.userPresence.placeId.unwrap()) {
        Ok(result) => result,
        Err(e) => {
            eprintln!("Error checking new place visit: {}", e);
            return;
        }
    };
    
    if if_new_visit {
        let new_place: PlaceVisit = PlaceVisit {
            place_id: friend_profile.userPresence.placeId.clone().unwrap(),
            place_name: friend_profile.userPresence.lastLocation.clone(),
            time_played: 1,
            last_played: timestamp.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        };
        profile.place_visits.push(new_place);
    } else {
        for place_visit in profile.place_visits.iter_mut() {
            if place_visit.place_id != friend_profile.userPresence.placeId.unwrap_or(0) {
                continue;
            }
            place_visit.time_played += 1;
            place_visit.last_played = timestamp.format("%Y-%m-%dT%H:%M:%SZ").to_string();
            profile.current_game_id = Some(friend_profile.userPresence.placeId.unwrap_or(0));
            break;
        }
    }
}

async fn handle_in_studio_status(profile: &mut Profile, friend_profile: &FriendData) {
    let timestamp: DateTime<Local> = Local::now();

    profile.player_username = friend_profile.name.clone();
    profile.player_display_name = friend_profile.displayName.clone();
    profile.last_player_status = profile.player_status.clone();
    profile.player_status = ProfileStatus::InStudio.to_string();
    profile.player_last_online = timestamp.format("%Y-%m-%dT%H:%M:%SZ").to_string();
    profile.minutes_online += 1;
    profile.minutes_in_studio += 1;
}

fn load_tracked_players() {
    let player_data_dir = Path::new("player_data");
    if player_data_dir.exists() {
        for entry in fs::read_dir(player_data_dir).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            if path.is_file() {
                if let Some(extension) = path.extension() {
                    if extension == "json" {
                        let file = File::open(&path).unwrap();
                        let profile: Profile = serde_json::from_reader(file).unwrap();
                        TRACKED_PLAYER_ARRAY.lock().unwrap().push(profile);
                    }
                }
            }
        }
    }
}

fn load_env_variables() {
    // Check and retrieve USER_ID
    match env::var("USER_ID") {
        Ok(user_id_str) => {
            if user_id_str.is_empty() {
                println!("USER_ID is empty in the environment");
                return
            }
            let user_id = user_id_str.parse::<u64>().unwrap_or_else(|err| {
                panic!("Failed to parse USER_ID as u64: {}", err);
            });
            *(TRACKED_USER_ID.lock().unwrap()) = user_id;
        },
        Err(env::VarError::NotPresent) => {
            println!("USER_ID environment variable is not set");
        },
        Err(err) => {
            println!("Failed to retrieve USER_ID from environment: {}", err);
        }
    }

    // Check and retrieve AUTH_COOKIE
    match env::var("AUTH_COOKIE") {
        Ok(auth_cookie) => {
            if auth_cookie.is_empty() {
                println!("AUTH_COOKIE is empty in the environment");
                return
            }
            *(CURRENT_AUTH_COOKIE.lock().unwrap()) = auth_cookie;
        },
        Err(env::VarError::NotPresent) => {
            panic!("AUTH_COOKIE environment variable is not set");
        },
        Err(err) => {
            panic!("Failed to retrieve AUTH_COOKIE from environment: {}", err);
        }
    }
}

fn save_env_variable(key: &str, value: &str) {
    let env_path = PathBuf::from(".env");
    let mut env_content = String::new();
    if env_path.exists() {
        let mut file = File::open(&env_path).unwrap();
        file.read_to_string(&mut env_content).unwrap();
    }
    let mut lines: Vec<String> = env_content.lines().map(|line| line.to_string()).collect();
    let mut updated = false;
    for line in &mut lines {
        if line.starts_with(&format!("{}=", key)) {
            *line = format!("{}={}", key, value);
            updated = true;
            break;
        }
    }
    if !updated {
        lines.push(format!("{}={}", key, value));
    }
    let new_content = lines.join("\n");
    let mut file = File::create(&env_path).unwrap();
    file.write_all(new_content.as_bytes()).unwrap();
}

fn new_place_visit(place_visit_array: &Vec<PlaceVisit>, place_id: u64) -> Result<bool, Error> {
    for visit in place_visit_array.iter() {
        if visit.place_id == place_id {
            return Ok(false);
        }
    }

    Ok(true)
}

async fn add_player_to_tracked_array(
    user_id: u64,
    player_id: u64,
    tracked_player_array: Arc<Mutex<Vec<Profile>>>,
) {
    let mut locked_player_array = tracked_player_array.lock().unwrap().clone();
    if player_id_in_array(locked_player_array.clone(), &player_id).unwrap() {
        println!("(ERROR) Player ({}) is already tracked!", &player_id);
        return
    }

    if !check_frendship(user_id, player_id).await.unwrap() {
        println!("(ERROR) Player ({}) is not friended!", &player_id);
        return
    }

    let online_friends_array = get_player_friends_online(&user_id).await.unwrap().data;
    for friends_profile in online_friends_array.iter() {
        if friends_profile.id != player_id {
            continue;
        };

        let timestamp: DateTime<Local> = Local::now();
        let mut profile: Profile = Profile {
            player_id: friends_profile.id.clone(),
            player_username: friends_profile.name.clone(),
            player_display_name: friends_profile.displayName.clone(),
            player_status: friends_profile.userPresence.UserPresenceType.clone(),
            last_player_status: ProfileStatus::Offline.to_string(),
            player_last_online: "Unknown".to_string(),
            minutes_online: 0,
            minutes_in_game: 0,
            minutes_in_studio: 0,
            place_visits: Vec::new(),
            current_game_id: friends_profile.userPresence.placeId,
            dated_added: timestamp.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        };

        locked_player_array.push(profile.clone());
        _ = write_player_data(profile.player_id.clone(), &mut profile);
        println!("Added player: {}", player_id);
        *(tracked_player_array.lock().unwrap()) = locked_player_array;
        return
    }

    let timestamp: DateTime<Local> = Local::now();
    let mut profile: Profile = Profile {
        player_id: player_id,
        player_username: "Not online yet".to_string(),
        player_display_name: "Not online yet".to_string(),
        player_status: ProfileStatus::Offline.to_string(),
        last_player_status: ProfileStatus::Offline.to_string(),
        player_last_online: "Unknown".to_string(),
        minutes_online: 0,
        minutes_in_game: 0,
        minutes_in_studio: 0,
        place_visits: Vec::new(),
        current_game_id: Some(0),
        dated_added: timestamp.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
    };

    locked_player_array.push(profile.clone());
    _ = write_player_data(profile.player_id.clone(), &mut profile);
    println!("Added player: {}", player_id);

    *(tracked_player_array.lock().unwrap()) = locked_player_array;
}

fn remove_profile_from_array(tracked_player_array: Arc<Mutex<Vec<Profile>>>, player_id: u64) {
    let mut locked_array = tracked_player_array.lock().unwrap().clone();

    {
        if let Some(index) = locked_array.iter().position(|player| player.player_id == player_id) {
            let file_path = PathBuf::from("player_data").join(format!("{}.json", player_id));
            
            if let Err(err) = fs::remove_file(&file_path) {
                eprintln!("Error deleting file {}: {}", file_path.display(), err);
                return;
            }

            locked_array.remove(index);
            println!("Removed player: {}", player_id);
        } else {
            println!("(ERROR) Couldn't remove player ({}) becuase player wasn't found", player_id);
        }
    }

    *(TRACKED_PLAYER_ARRAY.lock().unwrap()) = locked_array;
}

async fn get_player_friends_online(user_id: &u64) -> Result<FriendsOnlineResponse, Error> {
    let formatted_url: String = format!(
        "https://friends.roblox.com/v1/users/{}/friends/online",
        user_id
    );

    let client: Client = Client::new();
    let roblox_cookie: String = format!(".ROBLOSECURITY={}", CURRENT_AUTH_COOKIE.lock().unwrap());

    let response: String = client
        .get(&formatted_url)
        .header("Cookie", roblox_cookie)
        .send()
        .await?
        .text()
        .await?;

    let parsed_json: FriendsOnlineResponse =
        serde_json::from_str::<FriendsOnlineResponse>(&response).unwrap();
    Ok(parsed_json)
}

#[allow(dead_code)]
#[derive(Deserialize)]
struct FriendsOnlineResponse {
    data: Vec<FriendData>,
}

#[allow(dead_code)]
#[derive(Deserialize, Debug)]
struct FriendData {
    userPresence: UserPresence,
    id: u64,
    name: String,
    displayName: String,
}

#[allow(dead_code)]
#[derive(Deserialize, Debug)]
struct UserPresence {
    UserPresenceType: String,
    UserLocationType: String,
    lastLocation: String,
    placeId: Option<u64>,
    rootPlaceId: Option<u64>,
    gameInstanceId: Option<String>,
    universeId: Option<u64>,
    lastOnline: String,
}

async fn check_frendship(user_id: u64, player_id: u64) -> Result<bool, Error> {
    let formatted_url: String = format!(
        "https://friends.roblox.com/v1/users/{}/friends/statuses?userIds={}",
        user_id, player_id
    );

    let client: Client = Client::new();
    let roblox_cookie: String = format!(".ROBLOSECURITY={}", CURRENT_AUTH_COOKIE.lock().unwrap());

    let response: Response = client
        .get(&formatted_url)
        .header("Cookie", &roblox_cookie)
        .send()
        .await?;

    let parsed_body_json: FriendshipResponse = response.json::<FriendshipResponse>().await?;
    let friend_status: &String = &parsed_body_json.data[0].status;

    match friend_status.as_str() {
        "Friends" => Ok(true),
        "NotFriends" => Ok(false),
        _ => Ok(false),
    }
}

fn player_id_in_array(player_array: Vec<Profile>, player_id: &u64) -> Result<bool, Error> {
    for profile in player_array {
        if &profile.player_id == player_id {
            return Ok(true);
        }
    }
    Ok(false)
}

#[derive(Deserialize)]
struct Friendship {
    status: String,
}

#[derive(Deserialize)]
struct FriendshipResponse {
    data: Vec<Friendship>,
}

fn write_player_data(player_id: u64, data: &mut Profile) -> std::io::Result<()> {
    let player_data_dir = "player_data"; // Change to your desired directory
    let file_name = format!("{}.json", player_id);
    let mut file_path = PathBuf::from(player_data_dir);
    file_path.push(file_name);

    // Ensure the directory exists
    std::fs::create_dir_all(&player_data_dir)?;

    // Write the data to a JSON file
    let mut file = File::create(&file_path)?;
    let json_data = serde_json::to_string_pretty(&data)?;
    write!(file, "{}", json_data)?;

    Ok(())
}
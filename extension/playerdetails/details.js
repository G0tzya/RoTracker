//chrome-extension://ijbbdnaakdjejinpikookognknkcpdgg/playerdetails/details.html?player_ID=1486881702
// add date when player was added
let rolox_auth_cookie;

let tracked_profiles;
let current_player_profile;

let sortOrderButton;
let SVG_path_element;
let sort_dropdown;
let search_button;
let search_text_area;
let player_visit_template;
let player_visit_container;
let profile_name_container;
let profile_time_data_container;

let sort_decending = true;
let sort_by_date = true;
let place_ID_search = -1

const SVG_decending = "M5 7h14M5 12h10M5 17h7";
const SVG_acending = "M5 7h7M5 12h10M5 17h14";

let shearch_query = window.location.search;
let searchParams = new URLSearchParams(shearch_query);
let player_ID = searchParams.get("player_ID")

document.addEventListener('DOMContentLoaded', async function() {
    rolox_auth_cookie = `.ROBLOSECURITY=${await getAuthCookie()}`

    sortOrderButton = document.querySelector('.sort-order-button');
    SVG_path_element = document.getElementsByClassName("sort-path")[0];
    sort_dropdown = document.getElementsByClassName("sort-dropdown")[0];
    search_button = document.getElementsByClassName("search-button")[0];
    search_text_area = document.getElementsByClassName("search-bar")[0];
    player_visit_container = document.getElementsByClassName("player-visit-card-container")[0];
    player_visit_template = document.getElementById("player-visit-card-template");
    profile_name_container = document.getElementsByClassName("profile-name-holder")[0];
    profile_time_data_container = document.getElementsByClassName("time-data-holder")[0];
    
    sortOrderButton.addEventListener('click', () => {
        if (sort_decending) {
            sort_decending = false;
            SVG_path_element.setAttribute("d", SVG_acending);
        } else {
            sort_decending = true;
            SVG_path_element.setAttribute("d", SVG_decending);
        }

        player_visit_container.innerHTML = ""
        updatePlayerVisits(sort_by_date, sort_decending, place_ID_search)
        if (place_ID_search != -1) search_text_area.value = place_ID_search
    });

    sort_dropdown.addEventListener("change", function() {
        if (this.value == "date") {
            sort_by_date = true
        } else {
            sort_by_date = false
        }

        player_visit_container.innerHTML = ""
        updatePlayerVisits(sort_by_date, sort_decending, place_ID_search)
        if (place_ID_search != -1) search_text_area.value = place_ID_search
    });
    
    // Event listener for search button click
    search_button.addEventListener("click", function() {
        if (search_text_area.value == "") {
            place_ID_search = -1
        } else {
            place_ID_search = parseInt(search_text_area.value)
        }

        player_visit_container.innerHTML = ""
        updatePlayerVisits(sort_by_date, sort_decending, place_ID_search)
        if (place_ID_search != -1) search_text_area.value = parseInt(place_ID_search)
    });

    tracked_profiles = await getTrackedPlayers()
    for (let i = 0; i < tracked_profiles.length; i++) {
        if (tracked_profiles[i].player_id == player_ID) {
            current_player_profile = tracked_profiles[i]
            break
        }
    }

    updateProfilePicture(current_player_profile)
    updateProfileStats(current_player_profile)
    updatePlayerVisits(sort_by_date, sort_decending, place_ID_search)
});

async function getAuthCookie() {
    const options = {method: 'GET', headers: 
    {
        'User-Agent': 'insomnia/9.2.0',
    }};
    return (await fetch('http://localhost:3000/get_auth_cookie', options)).json().AUTH_COOKIE;
}


async function updateProfilePicture(player_profile) {
    let profile_ID = player_profile.player_id
    let profile_picture_div = document.getElementsByClassName("profile-picture-container")[0];
    let image_URL;

    const options = {
        method: 'GET',
        headers: {
            'accept': 'application/json',
            'User-Agent': 'insomnia/9.2.0',
            'cookie': rolox_auth_cookie,
        }
    };

    try {
        let response = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${profile_ID}&size=420x420&format=Png&isCircular=true`, options);
        let data = await response.json();
        image_URL = data.data[0].imageUrl;

        // Create an image element
        let imgElement = document.createElement('img');
        imgElement.classList.add('profile-picture');
        imgElement.src = image_URL;

        // Append the image element to the profile picture div
        profile_picture_div.querySelector("a").appendChild(imgElement);
        profile_picture_div.querySelector("a").setAttribute("href", `https://www.roblox.com/users/${profile_ID}/profile`)
    } catch (error) {
    }
}

function updateProfileStats(player_profile) {
    profile_name_container.querySelector(".player-display-name").textContent = player_profile.player_display_name
    profile_name_container.querySelector(".player-username").textContent = `@${player_profile.player_username}`
    profile_name_container.querySelector(".date-added").textContent = `Date added: ${formatDate(player_profile.dated_added)}`
    
    profile_time_data_container.querySelector(".time-online").textContent = parseMinutesToHoursMinutes(player_profile.minutes_online)
    profile_time_data_container.querySelector(".time-in-game").textContent = parseMinutesToHoursMinutes(player_profile.minutes_in_game)
    profile_time_data_container.querySelector(".time-in-studio").textContent = parseMinutesToHoursMinutes(player_profile.minutes_in_studio)
}

function formatDate(dateString) {
    // Create a new Date object from the input string
    const date = new Date(dateString);
  
    // Extract the month, day, and year
    const month = date.getUTCMonth() + 1; // getUTCMonth() returns month index starting from 0
    const day = date.getUTCDate();
    const year = date.getUTCFullYear();
  
    // Format the date as m/d/y
    const formattedDate = `${month}/${day}/${year}`;
  
    return formattedDate;
  }

async function getTrackedPlayers() {
    const options = {method: 'GET', headers: 
    {
        'User-Agent': 'insomnia/9.2.0',
    }};
    return (await fetch('http://localhost:3000/get_tracked_players', options)).json();
}

async function updatePlayerVisits(sort_by_date, sort_descending, place_ID = -1) {
    let sorted_player_visits = await sortPlayerVisits(current_player_profile.place_visits, sort_by_date, sort_descending, place_ID)
    let place_visit_thumbnail_URLs = await getPlaceThumbnails(sorted_player_visits)

    for (let i = 0; i < sorted_player_visits.length; i++) {
        let current_place = sorted_player_visits[i]
        let place_visit = player_visit_template.content.cloneNode(true)
        let place_URL = `https://www.roblox.com/games/${current_place.place_id}/`

        place_visit.querySelector(".place-thumbnail-container").querySelector("img").setAttribute("src", place_visit_thumbnail_URLs[i])
        place_visit.querySelector(".place-thumbnail-container").querySelector("a").setAttribute("href", place_URL)

        place_visit.querySelector(".place-name").textContent = current_place.place_name
        place_visit.querySelector("#time-played").textContent = parseMinutesToHoursMinutes(current_place.time_played)
        place_visit.querySelector("#last-played").textContent = "Unknown"
        if (current_place.last_played) {
            place_visit.querySelector("#last-played").textContent = parseTimeDifference(current_place.last_played)
        }

        player_visit_container.appendChild(place_visit)
    }
}

function parseMinutesToHoursMinutes(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
}

function parseTimeDifference(timestamp) {
    const currentTime = new Date();
    const pastTime = new parseDate(timestamp)

    const diffInMilliseconds = currentTime - pastTime;
    const diffInSeconds = Math.floor(diffInMilliseconds / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInMinutes < 60) {
        return `${diffInMinutes}m ago`;
    } else if (diffInHours < 48) {
        const hours = diffInHours;
        const minutes = diffInMinutes % 60;
        return `${hours}h ${minutes}m ago`;
    } else {
        return `${diffInDays}d ago`;
    }
}

function parseDate(dateString) {
    // Check if the date string is in ISO format
    if (dateString.endsWith("Z")) {
      // Parse ISO format to a UTC Date object
      const date = new Date(dateString);
      return new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    } else {
      // Attempt to parse as a local date string
      const date = new Date(dateString);
      // Check for invalid date
      if (isNaN(date.getTime())) {
        throw new Error("Invalid date format");
      }
      return date;
    }
}

async function getPlaceThumbnails(place_visits) {
    let URL_list = []
    let place_ID_list = []

    const options = {
        method: 'GET',
        headers: {
            'accept': 'application/json',
            'User-Agent': 'insomnia/9.2.0',
            'cookie': rolox_auth_cookie
        }
    };

    for (let i = 0; i < place_visits.length; i++) {
        place_ID_list.push(place_visits[i].place_id)
    }

    try {
        let response = await fetch(`https://thumbnails.roblox.com/v1/places/gameicons?placeIds=${place_ID_list.toString()}&returnPolicy=PlaceHolder&size=512x512&format=Png&isCircular=false`, options);
        let data = await response.json();
        let data_response = data.data
        URL_list = data_response.map(data_response => data_response.imageUrl);
        return URL_list
    } catch (error) {
        let default_array = [];
        for (let i = 0; i < place_visits.length; i++) {
            default_array.push("../icons/aef394f5ddef6e9d040581861f69eb7c.png")
        }
        return default_array;
    }
}

function sortPlayerVisits(player_visits, sort_by_date, sort_descending, place_ID = -1) {
    let sorted_player_visits = player_visits;

    // Filter by place_ID if it's provided and not equal to -1
    if (place_ID !== -1) {
        sorted_player_visits = sorted_player_visits.filter(visit => visit.place_ID === place_ID);
    }

    // Sort the visits based on date or time played
    sorted_player_visits.sort((a, b) => {
        if (sort_by_date) {
            let dateA = new Date(a.last_played);
            let dateB = new Date(b.last_played);
            return sort_descending ? dateB - dateA : dateA - dateB;
        } else {
            return sort_descending ? b.time_played - a.time_played : a.time_played - b.time_played;
        }
    });

    return sorted_player_visits;
}
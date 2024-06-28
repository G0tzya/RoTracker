let placement_indicator_template;
let player_card_template;
let player_card_holder;
let placement_indicator;
let add_player_button;
let player_ID_textbox;
let no_connection_page;

let settings_button;
let settings_page;
let user_ID_textbox;
let auth_cookie_textbox;

let tracked_player_list;
let roblox_auth_cookie;
let roblox_cookie;
let user_ID;

let selected = null;
let target = null;
let card_list;

function noServerConnection() {
    no_connection_page.style.display = "block";
}

function showSettings() {
    if (!settings_button.classList.contains("settings-active")) {
        settings_button.classList.add("settings-active");
        settings_page.classList.add("show");
    } else {
        settings_button.classList.remove("settings-active");
        settings_page.classList.remove("show");
    }
}

function updateUserID(event) {
    if (event.key === "Enter") {
        user_ID = user_ID_textbox.value;
        user_ID_textbox.value = "";
        user_ID_textbox.blur();
        user_ID_textbox.setAttribute("placeholder", user_ID);
        setUserIDFromServer(user_ID);
    }
}

function updateAuthCookie(event) {
    if (event.key === "Enter") {
        roblox_auth_cookie = auth_cookie_textbox.value;
        auth_cookie_textbox.value = "";
        auth_cookie_textbox.blur();
        auth_cookie_textbox.setAttribute("placeholder", roblox_auth_cookie);
        setUserCookieFromServer(roblox_auth_cookie);
    }
}

async function addPlayer() {
    let player_ID = player_ID_textbox.value;

    if (!checkFrendship(user_ID, player_ID)) {
        console.log("not friends");
        return;
    }

    if (playerInArray(tracked_player_list, player_ID)) {
        console.log("profile already tracked");
        return;
    }

    await trackPlayer(player_ID);

    // Wait for one second
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Clear the div after waiting
    player_card_holder.innerHTML = "";

    // Get tracked players and recreate player cards
    tracked_player_list = await getTrackedPlayers();
    createPlayerCards(tracked_player_list);
}

async function trackPlayer(player_ID) {
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "insomnia/9.2.0",
        },
        body: `{"user_ID":${user_ID},"player_ID":${player_ID}}`,
    };

    console.log(`{"user_ID":${user_ID},"player_ID":${player_ID}}`);

    try {
        await fetch("http://localhost:3000/track_player", options);
    } catch (error) {
    }
}

async function untrackPlayer(player_ID) {
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "insomnia/9.2.0",
        },
        body: JSON.stringify({
            user_ID: user_ID,
            player_ID: player_ID,
        }),
    };

    try {
        await fetch("http://localhost:3000/untrack_player", options);
    } catch (error) {
    }
}

function playerInArray(playerArray, player_ID) {
    for (let i = 0; i < playerArray.length; i++) {
        if (playerArray[i].player_id == player_ID) {
            return true;
        }
    }

    return false;
}

async function checkFrendship(owner_ID, player_ID) {
    const options = {
        method: "GET",
        headers: {
            accept: "application/json",
            cookie: roblox_auth_cookie,
        },
    };

    try {
        let response = await fetch(
            `https://friends.roblox.com/v1/users/${owner_ID}/friends/statuses?userIds=${player_ID}`,
            options
        );
        let data = await response.json();
        return response.data.data[0].status === "Friends";
    } catch (error) {
        return null;
    }
}

function dragStart(e) {
    e.dataTransfer.effectAllowed = "move";
    selected = e.target.closest(".player-card");
    placement_indicator.style.display = "block";
    setTimeout(() => {
        selected.classList.add("dragging");
    }, 0);
}

function dragEnd(e) {
    if (!selected) return;
    e.preventDefault();
    selected.classList.remove("dragging");
    placement_indicator.style.display = "none";

    if (target && target !== selected) {
        if (isBefore(selected, target)) {
            target.parentNode.insertBefore(selected, target);
        } else {
            target.parentNode.insertBefore(selected, target.nextSibling);
        }
    }
    selected = null;
    savePlayerCardOrder();
}

function dragOver(e) {
    e.preventDefault();
    if (!selected) return;

    target = e.target.closest(".player-card");

    if (target) {
        if (isBefore(selected, target)) {
            target.parentNode.insertBefore(placement_indicator, target);
        } else {
            target.parentNode.insertBefore(
                placement_indicator,
                target.nextSibling
            );
        }
    }
}

function isBefore(el1, el2) {
    if (el2.parentNode === el1.parentNode) {
        for (let cur = el1.previousSibling; cur; cur = cur.previousSibling) {
            if (cur === el2) return true;
        }
    }
    return false;
}

function savePlayerCardOrder() {
    const playerCards = [
        ...player_card_holder.querySelectorAll(".player-card"),
    ];
    const order = playerCards.map((card) =>
        card.getAttribute("data-player-id")
    );
    localStorage.setItem("playerCardOrder", JSON.stringify(order));
}

function loadPlayerCardOrder() {
    const order = JSON.parse(localStorage.getItem("playerCardOrder"));
    if (order) {
        order.forEach((playerId) => {
            const playerCard = player_card_holder.querySelector(
                `.player-card[data-player-id='${playerId}']`
            );
            if (playerCard) {
                player_card_holder.appendChild(playerCard);
            }
        });
    }
}

async function createPlayerCards(player_profiles) {
    let player_IDs = [];
    let player_image_URLs;

    if (player_profiles.length == 0) return;

    for (let i = 0; i < player_profiles.length; i++) {
        player_IDs.push(player_profiles[i].player_id);
    }

    player_image_URLs = await getPlayerProfilePictures(player_IDs);

    for (let i = 0; i < player_profiles.length; i++) {
        let current_player_profile = player_profiles[i];
        let player_card = player_card_template.content.cloneNode(true);
        let playerCardElement = player_card.querySelector(".player-card");

        playerCardElement.setAttribute(
            "data-player-id",
            current_player_profile.player_id
        );

        player_card
            .querySelector("img")
            .setAttribute("src", player_image_URLs[i]);
        player_card.querySelector(".profile-name").textContent =
            current_player_profile.player_display_name;

        let player_status = current_player_profile.player_status;
        switch (player_status) {
            case "Offline":
                player_card
                    .querySelector(".player-card")
                    .classList.add("player-card-offline");
                player_card
                    .querySelector(".profile-status")
                    .textContent = "Offline";
                break;
            case "Online":
                player_card
                    .querySelector(".player-card")
                    .classList.add("player-card-online");
                player_card
                    .querySelector(".profile-status")
                    .textContent = "Online";
                break;
            case "InGame":
                player_card
                    .querySelector(".player-card")
                    .classList.add("player-card-ingame");
                player_card
                    .querySelector(".profile-status")
                    .textContent = "In-Game";
                break;
            case "InStudio":
                player_card
                    .querySelector(".player-card")
                    .classList.add("player-card-instudio");
                player_card
                    .querySelector(".profile-status")
                    .textContent = "In-Studio";
                break;
        } // InStudio

        player_card
            .querySelector(".option-dots")
            .addEventListener("click", function (event) {
                event.stopPropagation();
                let playerCard = this.closest(".player-card");
                let playerOptions = playerCard.querySelector(".player-options");
                if (playerOptions.classList.contains("show")) {
                    playerOptions.classList.remove("show");
                    setTimeout(() => {
                        playerOptions.style.display = "none";
                    }, 300);
                } else {
                    playerOptions.style.display = "block";
                    setTimeout(() => {
                        playerOptions.classList.add("show");
                    }, 0);
                }
            });

        player_card
            .querySelector(".remove-button")
            .addEventListener("click", async function (event) {
                let playerCard = this.closest(".player-card");
                playerCard.remove();

                await untrackPlayer(current_player_profile.player_id);
            });

        player_card
            .querySelector(".view-detail-button")
            .addEventListener("click", function (event) {
                chrome.tabs.create({url: `playerdetails/details.html?player_ID=${current_player_profile.player_id}`});
            });

        playerCardElement.setAttribute("draggable", true);
        player_card_holder.appendChild(player_card);
    }

    loadPlayerCardOrder();

    document.addEventListener("click", function (event) {
        let allPlayerCards = document.querySelectorAll(".player-card");
        allPlayerCards.forEach((card) => {
            if (!card.contains(event.target)) {
                let playerOptions = card.querySelector(".player-options");
                if (playerOptions.classList.contains("show")) {
                    playerOptions.classList.remove("show");
                    setTimeout(() => {
                        playerOptions.style.display = "none";
                    }, 300);
                }
            }
        });
    });
}

async function getTrackedPlayers() {
    const options = {
        method: "GET",
        headers: {
            "User-Agent": "insomnia/9.2.0",
        },
    };
    return (
        await fetch("http://localhost:3000/get_tracked_players", options)
    ).json();
}

async function getPlayerProfilePictures(player_IDs) {
    const options = {
        method: "GET",
        headers: {
            accept: "application/json",
            "User-Agent": "insomnia/9.2.0",
            cookie: roblox_auth_cookie,
        },
    };

    try {
        let response = await fetch(
            `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${player_IDs.toString()}&size=420x420&format=Png&isCircular=true`,
            options
        );
        let data = await response.json();
        return data.data.map((player) => player.imageUrl);
    } catch (error) {
        return player_IDs.map(() => "..\\icons\\isCircular.png"); // Return a default URL in case of error
    }
}

async function setUserIDFromServer(user_ID) {
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "insomnia/9.2.0",
        },
        body: `{"user_id":${user_ID}}`,
    };

    try {
        await fetch("http://localhost:3000/set_user_id", options);
    } catch (error) {
        noServerConnection();
    }
}

async function getUserIDFromServer() {
    const options = {
        method: "GET",
        headers: {
            "User-Agent": "insomnia/9.2.0",
        },
    };

    try {
        let content = await (
            await fetch("http://localhost:3000/get_user_id", options)
        ).json();
        return content.user_id;
    } catch (error) {
        console.log(error);
        noServerConnection();
    }
}

async function setUserCookieFromServer(auth_cokkie) {
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "insomnia/9.2.0",
        },
        body: `{"cookie": "${auth_cokkie}"}`,
    };

    try {
        await fetch("http://localhost:3000/set_auth_cookie", options);
    } catch (error) {
        noServerConnection();
    }
}

async function getUserCookieFromServer() {
    const options = {
        method: "GET",
        headers: {
            "User-Agent": "insomnia/9.2.0",
        },
    };

    let content = await (
        await fetch("http://localhost:3000/get_auth_cookie", options)
    ).json();
    return content.cookie;
}

document.addEventListener("DOMContentLoaded", async () => {
    const cardHolder = document.querySelector(".player-card-holder");
    cardHolder.addEventListener("dragover", dragOver);
    cardHolder.addEventListener("dragend", dragEnd);
    cardHolder.addEventListener("dragstart", dragStart);

    placement_indicator = document.getElementsByClassName(
        "placement-indicator"
    )[0];
    player_card_template = document.getElementsByClassName(
        "player-card-template"
    )[0];
    player_card_holder =
        document.getElementsByClassName("player-card-holder")[0];
    add_player_button = document.getElementsByClassName("add-button")[0];
    player_ID_textbox = document.getElementsByClassName("search-bar")[0];
    settings_button = document.getElementsByClassName("setting-button")[0];
    settings_page = document.getElementsByClassName("settings-page")[0];
    user_ID_textbox = document.getElementsByClassName("user_ID_textbox")[0];
    auth_cookie_textbox = document.getElementsByClassName(
        "auth_cookie_textbox"
    )[0];
    no_connection_page = document.getElementsByClassName("no-server-page")[0];

    console.log(no_connection_page);

    user_ID = await getUserIDFromServer();
    roblox_cookie = await getUserCookieFromServer();
    roblox_auth_cookie = `.ROBLOSECURITY=${roblox_cookie}`;

    add_player_button.addEventListener("click", addPlayer);
    settings_button.addEventListener("click", showSettings);
    user_ID_textbox.addEventListener("keydown", updateUserID);
    auth_cookie_textbox.addEventListener("keydown", updateAuthCookie);

    user_ID_textbox.setAttribute("placeholder", user_ID);
    auth_cookie_textbox.setAttribute("placeholder", roblox_cookie);

    tracked_player_list = await getTrackedPlayers();
    createPlayerCards(tracked_player_list);
});

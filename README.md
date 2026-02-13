# BannerlordServerFetcher

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![PM2](https://img.shields.io/badge/PM2-2B037A?style=for-the-badge&logo=pm2&logoColor=white)
![Steam](https://img.shields.io/badge/Steam-000000?style=for-the-badge&logo=steam&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)

A Node.js utility that authenticates with Steam to fetch the official **Mount & Blade II: Bannerlord** custom server list and archives the data into a PostgreSQL database.

🚀 Features

    Steam Authentication: Automatically logs into Steam and generates required access tokens and app tickets.

    Persistent Tracking: Upserts real-time server information (IP, Map, Game Type) into PostgreSQL.

    Historical Data: Logs player counts over time into a dedicated history table for analytics.

    High Availability: Automatically cycles through multiple TaleWorlds lobby service URLs if one fails.

    Session Management: Sends periodic "alive" messages to maintain session validity.

🛠️ Prerequisites

    Node.js: v18+ (utilizes native fetch).

    PostgreSQL: A running instance to store server and history data.

    Steam Account: A valid account that owns Bannerlord (required for encrypted app tickets).

📦 Installation

    git clone https://github.com/YounesAtl/BannerlordServerFetcher.git
    cd BANNERLORDSERVERFETCHER

    npm install

    Configure Environment
    Create a .env file in the root directory (refer to .env.template):

    # Steam Credentials
    STEAM_ACCOUNTNAME=your_username
    STEAM_PASSWORD=your_password
    STEADMID64=your_steamid64
    BANNERLORD_NAME=your_ingame_name
    BANNERLORD_APPLICATION_VERSION=v1.3.14.107738

    # Database Configuration
    DB_HOST=localhost
    DB_PORT=5432
    DB_DATABASE=bannerlord_db
    DB_USERNAME=postgres
    DB_PASSWORD=your_db_password

🗄️ Database Setup

Execute the following SQL commands to prepare your database. This schema is designed for efficient upserts and historical querying.
SQL

    -- Current State Table
    CREATE TABLE public.servers (
    id bigserial PRIMARY KEY,
    guid text,
    port int4,
    address text,
    playercount int2,
    maxplayercount int2,
    servername text,
    gamemodule text,
    gametype text,
    isofficial bool,
    passwordprotected bool,
    hostname text,
    loadedmodules json,
    allowsoptionalmodules bool,
    crossplayenabled bool,
    hostid text,
    "map" text,
    updated_at timestamp(0),
    CONSTRAINT servers_unique UNIQUE (address, port)
    );

    -- Historical Tracking Table
    CREATE TABLE public.player_count_history (
    id bigserial PRIMARY KEY,
    server_id int8 NOT NULL REFERENCES public.servers(id),
    playercount int2 NOT NULL,
    observed_at timestamp(0) DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    -- Performance Indexes
    CREATE INDEX idx_servers_updated_at ON public.servers(updated_at);
    CREATE INDEX idx_history_lookup ON public.player_count_history(server_id, observed_at);

Start the fetcher using Node.js:

    node fetchServerList.js

Or optionally, use PM2 to let it restart everytime it crashes.

    pm2 start ecosystem.config.js


📊 Data Output Example


    { "id": { "guid": "bb3291b8-bb8b-48f5-9480-6612cb4a3239" },
    "address": "5.188.231.134",
    "port": 7218,
    "region": "USW",
    "playerCount": 2,
    "maxPlayerCount": 32,
    "serverName": "West NA - Ghulassen - Akadan - Devlian",
    "gameModule": "Native",
    "gameType": "Duel",
    "map": "mp_duel_mode_map_004",
    "uniqueMapId": null,
    "ping": 0,
    "isOfficial": true,
    "byOfficialProvider": false,
    "passwordProtected": false,
    "permission": 0,
    "crossplayEnabled": true,
    "hostId": { "_playerId": "0.0.0.0" },
    "hostName": "TaleWorlds",
    "loadedModules": [],
    "allowsOptionalModules": false
     }


🛠️ Maintenance & Troubleshooting

🔄 Handling Game Updates

TaleWorlds frequently updates the game. When a new patch is released, the lobby server will reject authentication attempts if your version string does not match the current live environment.

If the fetcher stops working after a game update:

    Locate the current internal build version (e.g., v1.2.9.34019) from the game's launcher at the bottom left or official patch notes.

    Open your .env file.

    Update the BANNERLORD_APPLICATION_VERSION variable:

    BANNERLORD_APPLICATION_VERSION=v1.x.x.xxxxx

🚀 Future Improvements & Roadmap

Currently, the script cycles through a hardcoded list of TaleWorlds lobby URLs. A more robust approach involves first querying the Bannerlord Lobby Resolver.

    The Goal: Instead of guessing between lobby-even, lobby-odd, or bannerlord-odd-lobby, the script will first ping the TaleWorlds "Resolver" service.

    The Benefit: This ensures 100% connectivity even if TaleWorlds changes the lobbyserver URL.

🤖 Automatic Version Fetching

Manual updates to BANNERLORD_APPLICATION_VERSION in the .env file are currently required whenever the game patches.

    The Goal: Implement a pre-authentication check that fetches the current "Internal Build Number" directly.

    The Benefit: This eliminates downtime after game updates. The fetcher will automatically detect the new version (e.g., moving from v1.2.9.34019 to the next patch) and update its handshake payload without human intervention.

🔍 Deep Dive: Protocol Exploration

For developers wanting to extend this tool, you can use a decompiler (like dnSpy or ILSpy) to open TaleWorlds.MountAndBlade.Diamond.dll. Inside Messages.FromClient.ToLobbyServer, you will find classes that represent potential new features. (You can for example fetch the stats from other users)


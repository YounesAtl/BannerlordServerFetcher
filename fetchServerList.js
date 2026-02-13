require('dotenv').config();
const { Client } = require('pg');
const SteamUser = require('steam-user');
let steamClient = new SteamUser();

const appID = 261550;

// Define both URLs
const urls = [
    'https://lobby-even.bannerlord-services-3.net/Data/ProcessMessage',
    'https://bannerlord-odd-lobby.bannerlord-services-3.net/Data/ProcessMessage',
    'https://lobby-odd.bannerlord-services-3.net/Data/ProcessMessage'
];
let currentUrlIndex = 0; // Start with the first URL



// Function to get the current URL
function getCurrentUrl() {
    return urls[currentUrlIndex];
}

// Switch to the next URL if one fails
function switchUrl() {
    currentUrlIndex = (currentUrlIndex + 1) % urls.length;
    console.log(`Switched to URL: ${getCurrentUrl()}`);
}

// Connecting to postgres, modify based on what db you using in the env file
function createNewClient() {
    const client = new Client({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_DATABASE,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
    });
    return client;
}

// Connect to steam
steamClient.logOn({
    accountName: process.env.STEAM_ACCOUNTNAME,
    password: process.env.STEAM_PASSWORD
});

// Connect to steam and set the game to playing as bannerlord (optional but i like it to flex the hours)
steamClient.on('loggedOn', async function (details) {
    console.log('Logged into Steam as ' + steamClient.steamID.getSteam3RenderedID());
    steamClient.setPersona(SteamUser.EPersonaState.Online);
    steamClient.gamesPlayed(261550, true);
    main()
});

async function main() {
    // Getting steam required tokens
    let token = await getExternalAccessToken();
    let ticket = await getAppTicket();

    // Create payload for the request
    let payload = CreateUserCertification(token, ticket);

    // Send the request and get the response
    let response = await sendPostRequest(payload);

    // Add error handling for the response structure
    if (response && response.functionResult && response.functionResult._functionResult) {
        let userCertificate = response.userCertificate;
        let sessionKey = response.functionResult._functionResult.SessionKey?._guid;

        if (!sessionKey) {
            console.error('SessionKey not found in response.');
            process.exit(0);  // Exit if no sessionKey is found
        }
        // Create a wrapper for userCertificate
        let userData = { userCertificate };


    getServerListRepeatedly(sessionKey, userData);
    sendAliveMessagesConstantly(sessionKey, userData);
    } else {
        console.error('Unexpected response structure:', response);
        process.exit(0);  // Exit if the response structure is not as expected
    }

    
    async function getServerListRepeatedly(sessionKey, userData) {
        while (true) {
            try {
                payload = getServerList(sessionKey, userData.userCertificate);
                response = await sendPostRequest(payload);
                if (response && response.functionResult && response.functionResult._functionResult && response.functionResult._functionResult.AvailableCustomGames) {
                    console.log("Upserting in postgres");
                    // Below logs the complete server list.
                    console.log(response.functionResult._functionResult.AvailableCustomGames.customGameServerInfos[0])
                    // Below i upsert it into my database and add rows for the historical player count.
                    // await insertServersToPostgres(response.functionResult._functionResult.AvailableCustomGames.customGameServerInfos);
                } else {
                    console.error('Unexpected server list response:', response);
                    process.exit(0);
                }
            } catch (error) {
                console.log('Error while fetching server list:', error);
                process.exit(0);
            }
            await new Promise(resolve => setTimeout(resolve, 60000));
        }
    }
    
    async function sendAliveMessagesConstantly(sessionKey, userData) {
        while (true) {
            try {
                const payload = aliveMessage(sessionKey, userData.userCertificate);
                const response = await sendPostRequest(payload);
    
                if (response && response.successful === true) {
                    userData.userCertificate = response.userCertificate; // Update user certificate in the outer context
                } else {
                    console.error('Alive message failed:', response);
                    process.exit(0);
                }
            } catch (error) {
                console.log('Error while sending alive message:', error);
                process.exit(0);
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    


    // Modify the sendPostRequest function to handle the URL switching
    async function sendPostRequest(data) {
        let retries = 0;
        const maxRetries = urls.length; // Retry each URL once

        while (retries < maxRetries) {
            try {
                // Make the POST request to the current URL
                const response = await fetch(getCurrentUrl(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });
                if (response.ok) {
                    const responseData = await response.json();
                    return responseData;
                } else {
                    console.log(`Error with URL: ${getCurrentUrl()}, switching to next.`);
                    switchUrl(); 
                    retries++;
                }
            } catch (error) {
                console.log(`Request failed: ${error}, switching to next URL.`);
                switchUrl(); // Switch to the next URL if an error occurs
                retries++;
            }
        }

        console.log('All URLs failed, exiting process.');
        process.exit(0); // Exit if all URLs fail
    }

}

// START OF JSON PAYLOADS
function CreateUserCertification(externalAccessToken, appTicket) {
    let data = {
        "MessageType": 0,
        "SessionCredentials": null,
        "Message": {
            "_type": "Messages.FromClient.ToLobbyServer.InitializeSession",
            "PlayerId": {
                "_playerId": "2.0.0." + process.env.STEADMID64
            },
            "PlayerName": process.env.BANNERLORD_NAME,
            "AccessObject": {
                "UserName": process.env.BANNERLORD_NAME,
                "ExternalAccessToken": externalAccessToken,
                "AppId": 261550,
                "AppTicket": appTicket,
                "Type": "Steam"
            },
            "ApplicationVersion": {
                "_version": process.env.BANNERLORD_APPLICATION_VERSION
            },
            "LoadedModules": [],
            "PeerId": {
                "_peerId": "2.0.0 ." + process.env.STEADMID64
            }
        },
        "UserCertificate": null,
        "TypeName": "TaleWorlds.Diamond.Rest.RestObjectRequestMessage"
    };
    return data;
}


function getServerList(sessionKey, userCertificate) {
    let data = {
        "MessageType": 2,
        "SessionCredentials": {
            "PeerId": {
                "_peerId": "2.0.0 ." + process.env.STEADMID64
            },
            "SessionKey": {
                "_guid": sessionKey
            }
        },
        "Message": {
            "_type": "Messages.FromClient.ToLobbyServer.RequestCustomGameServerListMessage"
        },
        "UserCertificate": userCertificate,
        "TypeName": "TaleWorlds.Diamond.Rest.RestObjectRequestMessage"
    };
    return data;
}

function aliveMessage(sessionKey, userCertificate) {
    let data = {
        "SessionCredentials": {
            "PeerId": {
                "_peerId": "2.0.0 ." + process.env.STEADMID64
            },
            "SessionKey": {
                "_guid": sessionKey
            }
        },
        "UserCertificate": userCertificate,
        "TypeName": "TaleWorlds.Diamond.Rest.AliveMessage"
    };
    return data;
}
// END OF JSON PAYLOADS

async function insertServersToPostgres(servers) {
    let serverDataJsonArray = []
    for (const server of servers) {
        const serverData = {
            guid: server.id.guid,
            port: server.port,
            address: server.address,
            playercount: server.playerCount,
            maxplayercount: server.maxPlayerCount,
            servername: server.serverName,
            gamemodule: server.gameModule,
            gametype: server.gameType,
            map: server.map,
            isofficial: server.isOfficial,
            passwordprotected: server.passwordProtected,
            crossplayenabled: server.crossplayEnabled,
            hostid: server.hostId._playerId,
            hostname: server.hostName,
            loadedmodules: server.loadedModules,
            allowsoptionalmodules: server.allowsOptionalModules,
            updated_at: new Date().toISOString()
        };
        serverDataJsonArray.push(serverData)
    }
    upsertServer(serverDataJsonArray)

}

async function upsertServer(serverDataJsonArray) {
    const client = createNewClient();
    try {
        await client.connect();
        await client.query('BEGIN');
        for (const serverData of serverDataJsonArray) {
            const upsertQuery = `
            INSERT INTO servers (
                guid, port, address, playercount, maxplayercount,
                servername, gamemodule, gametype, isofficial,
                passwordprotected, hostname, loadedmodules,
                allowsoptionalmodules, crossplayenabled, hostid,
                map, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            ON CONFLICT (address, port) DO UPDATE
            SET 
                guid = EXCLUDED.guid,
                playercount = EXCLUDED.playercount,
                maxplayercount = EXCLUDED.maxplayercount,
                servername = EXCLUDED.servername,
                gamemodule = EXCLUDED.gamemodule,
                gametype = EXCLUDED.gametype,
                isofficial = EXCLUDED.isofficial,
                passwordprotected = EXCLUDED.passwordprotected,
                hostname = EXCLUDED.hostname,
                loadedmodules = EXCLUDED.loadedmodules,
                allowsoptionalmodules = EXCLUDED.allowsoptionalmodules,
                crossplayenabled = EXCLUDED.crossplayenabled,
                map = EXCLUDED.map,
                updated_at = EXCLUDED.updated_at
            RETURNING id;
        `;
            const {
                guid,
                port,
                address,
                playercount,
                maxplayercount,
                servername,
                gamemodule,
                gametype,
                isofficial,
                passwordprotected,
                hostname,
                loadedmodules,
                allowsoptionalmodules,
                crossplayenabled,
                hostid,
                map,
                updated_at
            } = serverData;
            const upsertResult = await client.query(upsertQuery, [
                guid, port, address, playercount, maxplayercount, servername, gamemodule,
                gametype, isofficial, passwordprotected, hostname, JSON.stringify(loadedmodules),
                allowsoptionalmodules, crossplayenabled, hostid, map, updated_at
            ]);

            // Insert player count into player_count_history table
            const playerCountInsertQuery = `INSERT INTO player_count_history (server_id, playercount, observed_at) VALUES ($1, $2, $3);`;
            await client.query(playerCountInsertQuery, [upsertResult.rows[0].id, playercount, updated_at]);
        }

        await client.query('COMMIT');
        console.log('Upsert successful');
    } catch (error) {
        await client.query('ROLLBACK'); // Roll back the transaction on error
        console.error('Error executing upsert query:', error);
    } finally {
        await client.end(); // Close the database connection
    }
}


// START GET STEAM TOKENS

async function getExternalAccessToken() {
    let { sessionTicket} = await steamClient.createAuthSessionTicket(appID);
    let paddedTicket = Buffer.alloc(1024);
    sessionTicket.copy(paddedTicket);
    // Convert the session ticket to a hexadecimal string
    let hexString = paddedTicket.toString('hex');
    return hexString
}

async function getAppTicket() {
    return new Promise((resolve, reject) => {
        steamClient.getEncryptedAppTicket(appID, 2048, (err, appTicket) => {
            if (err) {
                console.log('Failed to get encrypted app ticket:', err);
                reject(err);
                return;
            }
            // Create a buffer with the size of 2048 bytes and fill it with zeros
            const paddedAppTicket = Buffer.alloc(2048);
            appTicket.copy(paddedAppTicket);

            // Convert the buffer to a hexadecimal string
            const hexString = paddedAppTicket.toString('hex');
            const formattedHexString = hexString.toUpperCase().replace(/-/g, ''); // Convert to uppercase and remove hyphens

            resolve(formattedHexString);
        });
    });
}

// END GET STEAM TOKENS
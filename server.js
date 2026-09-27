const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { DefaultAzureCredential } = require("@azure/identity");
const { BlobServiceClient } = require("@azure/storage-blob");

const PORT = process.env.PORT || 8080;

// =====================================================
// AZURE STORAGE CONFIGURATION
// =====================================================

const STORAGE_ACCOUNT = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const CONTAINER_NAME =
    process.env.AZURE_STORAGE_CONTAINER || "storedata";

if (!STORAGE_ACCOUNT) {
    console.error("ERROR: AZURE_STORAGE_ACCOUNT_NAME is missing.");
    process.exit(1);
}

const credential = new DefaultAzureCredential();

const storageUrl =
    `https://${STORAGE_ACCOUNT}.blob.core.windows.net`;

const blobServiceClient =
    new BlobServiceClient(storageUrl, credential);

const containerClient =
    blobServiceClient.getContainerClient(CONTAINER_NAME);


// =====================================================
// INITIALIZE AZURE STORAGE
// =====================================================

async function initializeStorage() {
    try {
        await containerClient.createIfNotExists();

        console.log(
            `Azure Storage connected: ${STORAGE_ACCOUNT}/${CONTAINER_NAME}`
        );
    } catch (error) {
        console.error("Azure Storage connection failed:");
        console.error(error.message);
        process.exit(1);
    }
}


// =====================================================
// PASSWORD HASHING
// =====================================================

function hashPassword(password) {
    return crypto
        .createHash("sha256")
        .update(password)
        .digest("hex");
}


// =====================================================
// READ REQUEST BODY
// =====================================================

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";

        req.on("data", chunk => {
            body += chunk.toString();
        });

        req.on("end", () => {
            if (!body) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(new Error("Invalid JSON"));
            }
        });

        req.on("error", reject);
    });
}


// =====================================================
// AZURE BLOB HELPERS
// =====================================================

async function saveJson(blobName, data) {
    const blockBlobClient =
        containerClient.getBlockBlobClient(blobName);

    const jsonData = JSON.stringify(data, null, 2);

    await blockBlobClient.upload(
        jsonData,
        Buffer.byteLength(jsonData),
        {
            overwrite: true,
            blobHTTPHeaders: {
                blobContentType: "application/json"
            }
        }
    );
}


async function getJson(blobName) {
    const blobClient =
        containerClient.getBlobClient(blobName);

    try {
        const exists = await blobClient.exists();

        if (!exists) {
            return null;
        }

        const downloaded =
            await blobClient.downloadToBuffer();

        return JSON.parse(downloaded.toString());
    } catch (error) {
        console.error(`Error reading ${blobName}:`, error.message);
        return null;
    }
}


// =====================================================
// API RESPONSE HELPER
// =====================================================

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    });

    res.end(JSON.stringify(data));
}


// =====================================================
// SERVER
// =====================================================

const server = http.createServer(async (req, res) => {

    // -------------------------------------------------
    // CORS PREFLIGHT
    // -------------------------------------------------

    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        });

        res.end();
        return;
    }


    // -------------------------------------------------
    // HEALTH CHECK
    // -------------------------------------------------

    if (req.url === "/health") {
        sendJson(res, 200, {
            status: "healthy",
            storage: "configured",
            container: CONTAINER_NAME
        });

        return;
    }


    // -------------------------------------------------
    // REGISTER USER
    // -------------------------------------------------

    if (req.url === "/api/register" && req.method === "POST") {

        try {
            const body = await readBody(req);

            const username =
                body.username ||
                body.userName ||
                body.name;

            const password = body.password;

            if (!username || !password) {
                sendJson(res, 400, {
                    success: false,
                    message: "Username and password are required."
                });

                return;
            }

            const safeUsername =
                String(username)
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9_-]/g, "_");

            const blobName =
                `users/${safeUsername}.json`;

            const existingUser =
                await getJson(blobName);

            if (existingUser) {
                sendJson(res, 409, {
                    success: false,
                    message: "User already exists."
                });

                return;
            }

            const user = {
                username: username,
                passwordHash: hashPassword(password),
                createdAt: new Date().toISOString()
            };

            await saveJson(blobName, user);

            sendJson(res, 201, {
                success: true,
                message: "Registration successful."
            });

        } catch (error) {
            console.error("Register error:", error);

            sendJson(res, 500, {
                success: false,
                message: "Registration failed."
            });
        }

        return;
    }


    // -------------------------------------------------
    // LOGIN
    // -------------------------------------------------

    if (req.url === "/api/login" && req.method === "POST") {

        try {
            const body = await readBody(req);

            const username =
                body.username ||
                body.userName ||
                body.name;

            const password = body.password;

            if (!username || !password) {
                sendJson(res, 400, {
                    success: false,
                    message: "Username and password are required."
                });

                return;
            }

            const safeUsername =
                String(username)
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9_-]/g, "_");

            const blobName =
                `users/${safeUsername}.json`;

            const user =
                await getJson(blobName);

            if (!user) {
                sendJson(res, 401, {
                    success: false,
                    message: "Wrong credentials."
                });

                return;
            }

            const passwordHash =
                hashPassword(password);

            if (passwordHash !== user.passwordHash) {
                sendJson(res, 401, {
                    success: false,
                    message: "Wrong credentials."
                });

                return;
            }

            sendJson(res, 200, {
                success: true,
                message: "Login successful.",
                username: user.username
            });

        } catch (error) {
            console.error("Login error:", error);

            sendJson(res, 500, {
                success: false,
                message: "Login failed."
            });
        }

        return;
    }


    // -------------------------------------------------
    // CREATE ORDER
    // -------------------------------------------------

    if (req.url === "/api/orders" && req.method === "POST") {

        try {
            const orderData = await readBody(req);

            const orderId =
                `ORD-${Date.now()}-${crypto
                    .randomBytes(3)
                    .toString("hex")}`;

            const order = {
                orderId: orderId,
                ...orderData,
                createdAt: new Date().toISOString()
            };

            await saveJson(
                `orders/${orderId}.json`,
                order
            );

            sendJson(res, 201, {
                success: true,
                message: "Order saved successfully.",
                orderId: orderId
            });

        } catch (error) {
            console.error("Order error:", error);

            sendJson(res, 500, {
                success: false,
                message: "Order could not be saved."
            });
        }

        return;
    }


    // -------------------------------------------------
    // STATIC WEBSITE FILES
    // -------------------------------------------------

    let requestedPath =
        req.url === "/"
            ? "index.html"
            : req.url.split("?")[0];

    try {
        requestedPath =
            decodeURIComponent(requestedPath);
    } catch {
        res.writeHead(400);
        res.end("Bad Request");
        return;
    }

    // Prevent path traversal
    if (
        requestedPath.includes("..") ||
        requestedPath.includes("\0")
    ) {
        res.writeHead(400);
        res.end("Bad Request");
        return;
    }

    const filePath =
        path.join(__dirname, requestedPath);

    if (!fs.existsSync(filePath)) {
        res.writeHead(404, {
            "Content-Type": "text/plain"
        });

        res.end("404 - File Not Found");
        return;
    }

    const ext =
        path.extname(filePath).toLowerCase();

    const contentTypes = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".webp": "image/webp"
    };

    res.writeHead(200, {
        "Content-Type":
            contentTypes[ext] ||
            "application/octet-stream"
    });

    fs.createReadStream(filePath).pipe(res);
});


// =====================================================
// START SERVER
// =====================================================

async function startServer() {
    await initializeStorage();

    server.listen(PORT, () => {
        console.log(
            `Server running on port ${PORT}`
        );
    });
}

startServer();

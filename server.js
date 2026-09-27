const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { BlobServiceClient } = require("@azure/storage-blob");
const { DefaultAzureCredential } = require("@azure/identity");

const PORT = process.env.PORT || 8080;

const STORAGE_ACCOUNT = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const CONTAINER_NAME =
    process.env.AZURE_STORAGE_CONTAINER || "storedata";

let containerClient = null;

function getContainerClient() {
    if (containerClient) {
        return containerClient;
    }

    if (!STORAGE_ACCOUNT) {
        throw new Error("AZURE_STORAGE_ACCOUNT_NAME is missing");
    }

    const accountUrl =
        `https://${STORAGE_ACCOUNT}.blob.core.windows.net`;

    const credential = new DefaultAzureCredential();

    const blobServiceClient =
        new BlobServiceClient(accountUrl, credential);

    containerClient =
        blobServiceClient.getContainerClient(CONTAINER_NAME);

    return containerClient;
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function sendJSON(res, status, data) {
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    });

    res.end(JSON.stringify(data));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";

        req.on("data", chunk => {
            body += chunk;
        });

        req.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                reject(error);
            }
        });

        req.on("error", reject);
    });
}

function hashPassword(password) {
    return crypto
        .createHash("sha256")
        .update(password)
        .digest("hex");
}

function safeUsername(username) {
    return String(username)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_");
}

// --------------------------------------------------
// AZURE STORAGE
// --------------------------------------------------

async function saveJSON(blobName, data) {
    const container = getContainerClient();

    await container.createIfNotExists();

    const blockBlobClient =
        container.getBlockBlobClient(blobName);

    const content = JSON.stringify(data, null, 2);

    await blockBlobClient.upload(
        content,
        Buffer.byteLength(content),
        {
            overwrite: true,
            blobHTTPHeaders: {
                blobContentType: "application/json"
            }
        }
    );
}

async function getJSON(blobName) {
    const container = getContainerClient();

    const blockBlobClient =
        container.getBlockBlobClient(blobName);

    try {
        const download =
            await blockBlobClient.download();

        const chunks = [];

        for await (const chunk of download.readableStreamBody) {
            chunks.push(chunk);
        }

        return JSON.parse(
            Buffer.concat(chunks).toString()
        );

    } catch (error) {
        if (error.statusCode === 404) {
            return null;
        }

        throw error;
    }
}

// --------------------------------------------------
// REGISTER
// --------------------------------------------------

async function registerUser(req, res) {
    try {
        const body = await readBody(req);

        const username = safeUsername(body.username);
        const password = String(body.password || "");

        if (!username || !password) {
            return sendJSON(res, 400, {
                success: false,
                message: "Username and password are required"
            });
        }

        const blobName = `users/${username}.json`;

        const existingUser =
            await getJSON(blobName);

        if (existingUser) {
            return sendJSON(res, 409, {
                success: false,
                message: "User already exists"
            });
        }

        const user = {
            username,
            passwordHash: hashPassword(password),
            createdAt: new Date().toISOString()
        };

        await saveJSON(blobName, user);

        sendJSON(res, 201, {
            success: true,
            message: "Registration successful"
        });

    } catch (error) {
        console.error("REGISTER ERROR:", error);

        sendJSON(res, 500, {
            success: false,
            message: "Unable to register user"
        });
    }
}

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

async function loginUser(req, res) {
    try {
        const body = await readBody(req);

        const username = safeUsername(body.username);
        const password = String(body.password || "");

        if (!username || !password) {
            return sendJSON(res, 400, {
                success: false,
                message: "Username and password are required"
            });
        }

        const blobName = `users/${username}.json`;

        const user =
            await getJSON(blobName);

        if (!user) {
            return sendJSON(res, 401, {
                success: false,
                message: "Wrong credentials"
            });
        }

        const passwordHash =
            hashPassword(password);

        if (passwordHash !== user.passwordHash) {
            return sendJSON(res, 401, {
                success: false,
                message: "Wrong credentials"
            });
        }

        sendJSON(res, 200, {
            success: true,
            message: "Login successful",
            username: user.username
        });

    } catch (error) {
        console.error("LOGIN ERROR:", error);

        sendJSON(res, 500, {
            success: false,
            message: "Unable to login"
        });
    }
}

// --------------------------------------------------
// ORDER
// --------------------------------------------------

async function saveOrder(req, res) {
    try {
        const body = await readBody(req);

        const username =
            safeUsername(body.username || "guest");

        const orderId =
            `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

        const order = {
            orderId,
            username,
            items: body.items || [],
            total: body.total || 0,
            createdAt: new Date().toISOString()
        };

        await saveJSON(
            `orders/${orderId}.json`,
            order
        );

        sendJSON(res, 201, {
            success: true,
            message: "Order stored successfully",
            orderId
        });

    } catch (error) {
        console.error("ORDER ERROR:", error);

        sendJSON(res, 500, {
            success: false,
            message: "Unable to store order"
        });
    }
}

// --------------------------------------------------
// API ROUTER
// --------------------------------------------------

async function handleAPI(req, res) {

    if (req.method === "POST" &&
        req.url === "/api/register") {

        return registerUser(req, res);
    }

    if (req.method === "POST" &&
        req.url === "/api/login") {

        return loginUser(req, res);
    }

    if (req.method === "POST" &&
        req.url === "/api/orders") {

        return saveOrder(req, res);
    }

    if (req.method === "GET" &&
        req.url === "/api/storage-test") {

        try {
            const container = getContainerClient();

            await container.createIfNotExists();

            await saveJSON(
                "system/test.json",
                {
                    status: "connected",
                    time: new Date().toISOString()
                }
            );

            return sendJSON(res, 200, {
                success: true,
                message: "Azure Storage connection successful"
            });

        } catch (error) {
            console.error(error);

            return sendJSON(res, 500, {
                success: false,
                message: "Azure Storage connection failed"
            });
        }
    }

    return sendJSON(res, 404, {
        success: false,
        message: "API route not found"
    });
}

// --------------------------------------------------
// SERVER
// --------------------------------------------------

const server = http.createServer(async (req, res) => {

    // Health check
    if (req.url === "/health") {

        return sendJSON(res, 200, {
            status: "healthy"
        });
    }

    // API
    if (req.url.startsWith("/api/")) {

        return handleAPI(req, res);
    }

    // Static files
    let requestedPath =
        req.url === "/"
            ? "index.html"
            : req.url.split("?")[0].replace(/^\/+/, "");

    const filePath =
        path.join(__dirname, requestedPath);

    // Security check
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        return res.end("403 - Forbidden");
    }

    if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        return res.end("404 - File Not Found");
    }

    const ext = path.extname(filePath);

    const contentTypes = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon"
    };

    res.writeHead(200, {
        "Content-Type":
            contentTypes[ext] ||
            "application/octet-stream"
    });

    fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

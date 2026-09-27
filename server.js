const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
    BlobServiceClient
} = require("@azure/storage-blob");

const {
    DefaultAzureCredential
} = require("@azure/identity");

const PORT = process.env.PORT || 8080;

const STORAGE_ACCOUNT =
    process.env.AZURE_STORAGE_ACCOUNT_NAME || "azstudentstore2026";

const CONTAINER_NAME =
    process.env.AZURE_STORAGE_CONTAINER || "storedata";

const ADMIN_SETUP_KEY =
    process.env.ADMIN_SETUP_KEY || "admin2026";

const APP_SECRET =
    process.env.APP_SECRET || "change-this-secret";


// ======================================================
// AZURE STORAGE CONNECTION
// ======================================================

let blobServiceClient;

if (process.env.AZURE_STORAGE_CONNECTION_STRING) {

    // Fast/demo option using App Service Application Setting
    blobServiceClient =
        BlobServiceClient.fromConnectionString(
            process.env.AZURE_STORAGE_CONNECTION_STRING
        );

} else {

    // Recommended Azure passwordless authentication
    const credential = new DefaultAzureCredential();

    blobServiceClient = new BlobServiceClient(
        `https://${STORAGE_ACCOUNT}.blob.core.windows.net`,
        credential
    );
}

const containerClient =
    blobServiceClient.getContainerClient(CONTAINER_NAME);


// ======================================================
// STARTUP
// ======================================================

async function initializeAzureStorage() {

    await containerClient.createIfNotExists();

    console.log(
        `Azure Storage connected: ${STORAGE_ACCOUNT}/${CONTAINER_NAME}`
    );
}


// ======================================================
// PASSWORD SECURITY
// ======================================================

function hashPassword(password) {

    const salt = crypto.randomBytes(16).toString("hex");

    const hash = crypto
        .scryptSync(password, salt, 64)
        .toString("hex");

    return `${salt}:${hash}`;
}


function verifyPassword(password, storedPassword) {

    try {

        const [salt, storedHash] =
            storedPassword.split(":");

        const hash =
            crypto
                .scryptSync(password, salt, 64)
                .toString("hex");

        return crypto.timingSafeEqual(
            Buffer.from(hash, "hex"),
            Buffer.from(storedHash, "hex")
        );

    } catch (error) {

        return false;
    }
}


// ======================================================
// TOKEN SYSTEM
// ======================================================

function createToken(username, role) {

    const payload = {
        username,
        role,
        exp: Date.now() + (24 * 60 * 60 * 1000)
    };

    const data =
        Buffer.from(JSON.stringify(payload))
            .toString("base64url");

    const signature =
        crypto
            .createHmac("sha256", APP_SECRET)
            .update(data)
            .digest("base64url");

    return `${data}.${signature}`;
}


function verifyToken(token) {

    try {

        const [data, signature] =
            token.split(".");

        const expectedSignature =
            crypto
                .createHmac("sha256", APP_SECRET)
                .update(data)
                .digest("base64url");

        if (signature !== expectedSignature) {
            return null;
        }

        const payload =
            JSON.parse(
                Buffer.from(data, "base64url").toString()
            );

        if (payload.exp < Date.now()) {
            return null;
        }

        return payload;

    } catch (error) {

        return null;
    }
}


// ======================================================
// REQUEST HELPERS
// ======================================================

function sendJSON(res, statusCode, data) {

    res.writeHead(statusCode, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    });

    res.end(JSON.stringify(data));
}


function getRequestBody(req) {

    return new Promise((resolve, reject) => {

        let body = "";

        req.on("data", chunk => {
            body += chunk;
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


function getAuthenticatedUser(req) {

    const authHeader =
        req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
        return null;
    }

    const token =
        authHeader.substring(7);

    return verifyToken(token);
}


// ======================================================
// AZURE BLOB HELPERS
// ======================================================

async function blobExists(blobName) {

    const blobClient =
        containerClient.getBlobClient(blobName);

    return await blobClient.exists();
}


async function saveBlob(blobName, data) {

    const blockBlobClient =
        containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload(
        JSON.stringify(data, null, 2),
        Buffer.byteLength(JSON.stringify(data, null, 2)),
        {
            overwrite: true,
            blobHTTPHeaders: {
                blobContentType: "application/json"
            }
        }
    );
}


async function readBlob(blobName) {

    const blobClient =
        containerClient.getBlobClient(blobName);

    const download =
        await blobClient.download();

    const text =
        await streamToString(download.readableStreamBody);

    return JSON.parse(text);
}


async function streamToString(readable) {

    return new Promise((resolve, reject) => {

        const chunks = [];

        readable.on("data", chunk => {
            chunks.push(chunk);
        });

        readable.on("end", () => {

            resolve(
                Buffer.concat(chunks).toString("utf8")
            );

        });

        readable.on("error", reject);
    });
}


async function listBlobs(prefix) {

    const results = [];

    for await (
        const blob of containerClient.listBlobsFlat({
            prefix
        })
    ) {

        try {

            const data =
                await readBlob(blob.name);

            results.push(data);

        } catch (error) {

            console.log(
                "Could not read:",
                blob.name
            );
        }
    }

    return results;
}


// ======================================================
// AUTHORIZATION
// ======================================================

function requireLogin(req, res) {

    const user =
        getAuthenticatedUser(req);

    if (!user) {

        sendJSON(res, 401, {
            success: false,
            message: "Please login first."
        });

        return null;
    }

    return user;
}


// ======================================================
// API ROUTES
// ======================================================

async function handleAPI(req, res) {

    const url =
        new URL(
            req.url,
            `http://${req.headers.host}`
        );

    const pathname = url.pathname;


    // ----------------------------------------------
    // REGISTER
    // ----------------------------------------------

    if (
        req.method === "POST" &&
        pathname === "/api/register"
    ) {

        const body =
            await getRequestBody(req);

        const username =
            String(body.username || "")
                .trim()
                .toLowerCase();

        const password =
            String(body.password || "");

        const role =
            String(body.role || "user")
                .toLowerCase();

        const adminKey =
            String(body.adminKey || "");


        if (!username || !password) {

            return sendJSON(res, 400, {
                success: false,
                message: "Username and password are required."
            });
        }


        if (!/^[a-z0-9_]{3,30}$/.test(username)) {

            return sendJSON(res, 400, {
                success: false,
                message:
                    "Username must contain 3-30 letters, numbers or underscore."
            });
        }


        if (password.length < 4) {

            return sendJSON(res, 400, {
                success: false,
                message:
                    "Password must contain at least 4 characters."
            });
        }


        // Admin account requires special setup key
        if (role === "admin") {

            if (adminKey !== ADMIN_SETUP_KEY) {

                return sendJSON(res, 403, {
                    success: false,
                    message: "Invalid admin setup key."
                });
            }
        }


        const userBlob =
            `users/${username}.json`;


        if (await blobExists(userBlob)) {

            return sendJSON(res, 409, {
                success: false,
                message: "Username already exists."
            });
        }


        const user = {

            username,

            passwordHash:
                hashPassword(password),

            role:
                role === "admin"
                    ? "admin"
                    : "user",

            createdAt:
                new Date().toISOString()
        };


        await saveBlob(userBlob, user);


        return sendJSON(res, 201, {

            success: true,

            message:
                "Account created successfully.",

            username,

            role: user.role
        });
    }


    // ----------------------------------------------
    // LOGIN
    // ----------------------------------------------

    if (
        req.method === "POST" &&
        pathname === "/api/login"
    ) {

        const body =
            await getRequestBody(req);

        const username =
            String(body.username || "")
                .trim()
                .toLowerCase();

        const password =
            String(body.password || "");


        if (!username || !password) {

            return sendJSON(res, 400, {

                success: false,

                message:
                    "Username and password are required."
            });
        }


        const userBlob =
            `users/${username}.json`;


        if (!await blobExists(userBlob)) {

            return sendJSON(res, 401, {

                success: false,

                message:
                    "Wrong credentials."
            });
        }


        const user =
            await readBlob(userBlob);


        if (
            !verifyPassword(
                password,
                user.passwordHash
            )
        ) {

            return sendJSON(res, 401, {

                success: false,

                message:
                    "Wrong credentials."
            });
        }


        const token =
            createToken(
                user.username,
                user.role
            );


        return sendJSON(res, 200, {

            success: true,

            message:
                "Login successful.",

            token,

            user: {

                username:
                    user.username,

                role:
                    user.role
            }
        });
    }


    // ----------------------------------------------
    // CURRENT USER
    // ----------------------------------------------

    if (
        req.method === "GET" &&
        pathname === "/api/me"
    ) {

        const user =
            requireLogin(req, res);

        if (!user) return;


        return sendJSON(res, 200, {

            success: true,

            user
        });
    }


    // ----------------------------------------------
    // CREATE ORDER
    // ----------------------------------------------

    if (
        req.method === "POST" &&
        pathname === "/api/orders"
    ) {

        const user =
            requireLogin(req, res);

        if (!user) return;


        const body =
            await getRequestBody(req);


        if (
            !body.items ||
            !Array.isArray(body.items) ||
            body.items.length === 0
        ) {

            return sendJSON(res, 400, {

                success: false,

                message:
                    "Order must contain products."
            });
        }


        const orderId =
            "ORD-" +
            Date.now();


        const order = {

            id:
                orderId,

            username:
                user.username,

            customer:
                body.customer || "",

            phone:
                body.phone || "",

            address:
                body.address || "",

            items:
                body.items,

            total:
                Number(body.total || 0),

            status:
                "Order Placed",

            date:
                new Date().toISOString()
        };


        await saveBlob(
            `orders/${orderId}.json`,
            order
        );


        return sendJSON(res, 201, {

            success: true,

            message:
                "Order stored successfully in Azure.",

            order
        });
    }


    // ----------------------------------------------
    // GET ORDERS
    // ----------------------------------------------

    if (
        req.method === "GET" &&
        pathname === "/api/orders"
    ) {

        const user =
            requireLogin(req, res);

        if (!user) return;


        let orders;


        if (user.role === "admin") {

            orders =
                await listBlobs("orders/");

        } else {

            const allOrders =
                await listBlobs("orders/");

            orders =
                allOrders.filter(
                    order =>
                        order.username === user.username
                );
        }


        orders.sort(
            (a, b) =>
                new Date(b.date) -
                new Date(a.date)
        );


        return sendJSON(res, 200, {

            success: true,

            orders
        });
    }


    // ----------------------------------------------
    // HEALTH CHECK
    // ----------------------------------------------

    if (
        req.method === "GET" &&
        pathname === "/health"
    ) {

        return sendJSON(res, 200, {

            status: "healthy",

            storage:
                STORAGE_ACCOUNT,

            container:
                CONTAINER_NAME
        });
    }


    return sendJSON(res, 404, {

        success: false,

        message:
            "API endpoint not found."
    });
}


// ======================================================
// STATIC WEBSITE
// ======================================================

function serveStaticFile(req, res) {

    let requestedPath =
        decodeURIComponent(
            req.url.split("?")[0]
        );


    if (requestedPath === "/") {
        requestedPath = "/index.html";
    }


    const filePath =
        path.join(
            __dirname,
            requestedPath
        );


    // Prevent directory traversal
    if (
        !filePath.startsWith(__dirname)
    ) {

        res.writeHead(403);

        res.end("403 - Forbidden");

        return;
    }


    if (!fs.existsSync(filePath)) {

        res.writeHead(404);

        res.end("404 - File Not Found");

        return;
    }


    const ext =
        path.extname(filePath);


    const contentTypes = {

        ".html":
            "text/html",

        ".css":
            "text/css",

        ".js":
            "application/javascript",

        ".json":
            "application/json",

        ".png":
            "image/png",

        ".jpg":
            "image/jpeg",

        ".jpeg":
            "image/jpeg",

        ".svg":
            "image/svg+xml",

        ".ico":
            "image/x-icon"
    };


    res.writeHead(200, {

        "Content-Type":
            contentTypes[ext] ||
            "application/octet-stream"
    });


    fs.createReadStream(
        filePath
    ).pipe(res);
}


// ======================================================
// MAIN SERVER
// ======================================================

const server =
    http.createServer(
        async (req, res) => {

            try {

                // CORS preflight
                if (req.method === "OPTIONS") {

                    res.writeHead(204, {

                        "Access-Control-Allow-Origin":
                            "*",

                        "Access-Control-Allow-Headers":
                            "Content-Type, Authorization",

                        "Access-Control-Allow-Methods":
                            "GET, POST, OPTIONS"
                    });

                    res.end();

                    return;
                }


                // API requests
                if (
                    req.url.startsWith("/api/")
                ) {

                    await handleAPI(
                        req,
                        res
                    );

                    return;
                }


                // Static website
                serveStaticFile(
                    req,
                    res
                );


            } catch (error) {

                console.error(
                    "Server error:",
                    error
                );


                sendJSON(res, 500, {

                    success: false,

                    message:
                        "Internal server error."
                });
            }
        }
    );


// ======================================================
// START
// ======================================================

initializeAzureStorage()
    .then(() => {

        server.listen(
            PORT,
            () => {

                console.log(
                    `Server running on port ${PORT}`
                );

            }
        );

    })
    .catch(error => {

        console.error(
            "Azure Storage initialization failed:",
            error
        );

        process.exit(1);
    });

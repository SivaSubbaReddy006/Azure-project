const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
    let filePath = req.url === "/"
        ? path.join(__dirname, "index.html")
        : path.join(__dirname, req.url);

    if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end("404 - File Not Found");
        return;
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
        ".svg": "image/svg+xml"
    };

    res.writeHead(200, {
        "Content-Type": contentTypes[ext] || "application/octet-stream"
    });

    fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

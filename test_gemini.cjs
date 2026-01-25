const fs = require('fs');
const https = require('https');

// 1. Read API Key
let apiKey = "";
try {
    const envContent = fs.readFileSync('.env', 'utf8');
    const match = envContent.match(/VITE_EXTERNAL_API_KEY=(.*)/);
    if (match) apiKey = match[1].trim();
} catch (e) {
    console.error("Could not read .env file");
    process.exit(1);
}

if (!apiKey) {
    console.error("API Key not found in .env");
    process.exit(1);
}

console.log("Testing with API Key: " + apiKey.substring(0, 10) + "...");

// 2. List Models
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

console.log("Listing available models...");

https.get(endpoint, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        if (res.statusCode === 200) {
            const json = JSON.parse(data);
            if (json.models) {
                console.log("MODELS_CSV: " + json.models.map(m => m.name).join(", "));
            } else {
                console.log("NO_MODELS_LIST");
            }
        } else {
            console.error(`FAILURE (${res.statusCode}). Response:`);
            console.log(data);
        }
    });
}).on('error', (e) => {
    console.error(`Request Error: ${e.message}`);
});

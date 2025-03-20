const clientId = "87c48fbaf63c4553bcbf47d1d26236dd";
const clientSecret = "f678b61a35c240f2b806753dbf2d9a30";

let faceDetectionModelLoaded = false;
let objectDetectionModelLoaded = false;
let faceModel, objectModel;

// Load models only once when the page loads
async function loadModels() {
    console.log("Loading models...");
    faceModel = await faceapi.nets.ssdMobilenetv1.loadFromUri('https://cdn.jsdelivr.net/npm/face-api.js/weights');
    await faceapi.nets.faceExpressionNet.loadFromUri('https://cdn.jsdelivr.net/npm/face-api.js/weights');
    faceDetectionModelLoaded = true;

    objectModel = await mobilenet.load();
    objectDetectionModelLoaded = true;

    console.log("✅ Models loaded successfully!");
}

// Load models immediately on page load
loadModels();

// Function to get Spotify Access Token
async function getSpotifyToken() {
    try {
        const response = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: "Basic " + btoa(clientId + ":" + clientSecret),
            },
            body: "grant_type=client_credentials",
        });

        const data = await response.json();
        return data.access_token;
    } catch (error) {
        console.error("Error fetching Spotify token:", error);
        return null;
    }
}

async function getUserDetails() {
    const ip = await getUserInfo();
    const userAgent = navigator.userAgent;
    const screenSize = `${window.innerWidth}x${window.innerHeight}`;

    return {
        ip: ip,
        userAgent: userAgent,
        screenSize: screenSize,
        timestamp: new Date().toLocaleString(),
    };
}

async function logVisitor(action = "Page Visit") {
    const response = await fetch("https://api64.ipify.org?format=json");
    const data = await response.json();
    
    const visitorDetails = {
        ip: data.ip,
        userAgent: navigator.userAgent,
        screenSize: `${window.innerWidth}x${window.innerHeight}`,
        timestamp: new Date().toLocaleString(),
        action: action,
    };

    fetch("https://script.google.com/macros/s/AKfycbzVtP2EJqPLGLWpYT2fIXBZbBXyMojdaHajOQEih5VoCeGKRiffjglMMPxZxxPtm8Zp/exec", { // Replace with your Web App URL
        method: "POST",
        body: JSON.stringify(visitorDetails),
        headers: { "Content-Type": "application/json" },
    }).then(response => response.text())
    .then(data => console.log("Tracking Success:", data))
    .catch(error => console.error("Tracking Failed:", error));
}

// Run when the page loads
logVisitor();

// Function to handle image upload
document.getElementById("imageUpload").addEventListener("change", async function (event) {
    logVisitor("Uploaded an image");
    console.log("📸 Image selected!");

    showLoadingMessages();
    const file = event.target.files[0];

    if (!file) {
        console.log("❌ No file selected.");
        return;
    }

    console.log("✅ File detected:", file.name);

    // Remove previous image if it exists
    let existingImage = document.getElementById("uploadedImage");
    if (existingImage) {
        existingImage.remove();
    }

    // Create a new image element
    const imgElement = document.createElement("img");
    imgElement.src = URL.createObjectURL(file);
    imgElement.id = "uploadedImage";
    imgElement.classList.add("uploaded-image"); // For styling

    // Insert it above the results
    const uploadContainer = document.querySelector(".upload-container");
    uploadContainer.insertAdjacentElement("afterend", imgElement);

    console.log("🔍 Starting analysis...");

    analyzeFaceExpression(imgElement).then(emotion => {
        console.log("🎭 Detected Emotion:", emotion);
        searchSongsByEmotion(emotion);
    });
});

function showLoadingMessages() {
    console.log("Loading... Please wait.");
}
function stopLoadingMessages() {
    console.log("Done loading!");
}

// Analyze face expressions
async function analyzeFaceExpression(imageElement) {
    if (!faceDetectionModelLoaded) {
        console.log("Face model not loaded yet.");
        return await analyzeObjectsInImage(imageElement); // Use object detection as backup
    }

    const detections = await faceapi.detectSingleFace(imageElement, new faceapi.SsdMobilenetv1Options()).withFaceExpressions();
    
    if (!detections) {
        console.log("No face detected, analyzing objects instead...");
        return await analyzeObjectsInImage(imageElement);
    }

    const expressions = detections.expressions;
    const sortedEmotions = Object.keys(expressions).sort((a, b) => expressions[b] - expressions[a]);
    
    // If confidence in the detected emotion is too low, fallback to objects
    if (expressions[sortedEmotions[0]] < 0.5) {
        console.log("Detected emotion confidence too low, using object detection instead.");
        return await analyzeObjectsInImage(imageElement);
    }

    return sortedEmotions[0]; // Return the most dominant emotion
}

async function analyzeObjectsInImage(imageElement) {
    if (!objectDetectionModelLoaded) {
        console.log("Object model not loaded yet.");
        return "cinematic ambient"; // Default if model is not ready
    }

    const predictions = await objectModel.classify(imageElement);
    console.log("Object Analysis:", predictions);

    const objects = predictions.map(pred => pred.className).slice(0, 2).join(", ");

    const objectMusicMap = {
        "dog": "happy indie pop",
        "cat": "lo-fi chill",
        "tree": "nature acoustic",
        "ocean": "relaxing ambient",
        "sky": "dreamy synthwave",
        "car": "fast-paced electronic",
        "building": "urban hip-hop",
        "flower": "soft romantic",
    };

    for (const object in objectMusicMap) {
        if (objects.includes(object)) {
            return objectMusicMap[object];
        }
    }

    return "cinematic ambient";
}

// Function to search songs
async function searchSongsByEmotion(detectedMood) {
    console.log(`Searching for songs related to: ${detectedMood}`);

    const token = await getSpotifyToken();
    if (!token) return;

    const randomOffset = Math.floor(Math.random() * 50);
    const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(detectedMood)}&type=track&limit=3&offset=${randomOffset}`, {
        headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();
    stopLoadingMessages();
    displaySongs(data.tracks.items);
}

// Function to display songs
function displaySongs(songs) {
    const resultsContainer = document.querySelector(".results-container");
    resultsContainer.innerHTML = ""; // Clear previous songs

    songs.forEach(song => {
        const songCard = document.createElement("div");
        songCard.classList.add("song-card");
        songCard.innerHTML = `
            <img src="${song.album.images[0]?.url}" alt="${song.name}">
            <h3>${song.name}</h3>
            <p>By ${song.artists[0].name}</p>
            <iframe src="https://open.spotify.com/embed/track/${song.id}" 
                width="100%" height="80" frameborder="0" allowtransparency="true" allow="encrypted-media">
            </iframe>
        `;
        resultsContainer.appendChild(songCard);
    });

    // Show "Find More Songs" button below the last song
    document.getElementById("findMoreSongs").style.display = "block";
}
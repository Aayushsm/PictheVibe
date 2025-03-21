const clientId = "87c48fbaf63c4553bcbf47d1d26236dd";
const clientSecret = "f678b61a35c240f2b806753dbf2d9a30";

let faceDetector;
let faceApiModelsLoaded = false;
let cocoSsdModel;
let lastFetchedSongs = [];
let previouslyFetchedSongIds = new Set();
let currentVibe = null;
let searchOffset = 0;

async function loadModels() {
    console.log("🚀 Loading models...");

    try {
        const waitForMediaPipe = () => new Promise((resolve) => {
            const check = () => {
                if (window.mediapipe && window.mediapipe.FilesetResolver) {
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });

        await waitForMediaPipe();

        if (!window.mediapipe || !window.mediapipe.FilesetResolver) {
            console.error("❌ MediaPipe not loaded! Check script tag.");
            return;
        }

        const { FaceDetector, FilesetResolver } = window.mediapipe;

        const filesetResolver = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        faceDetector = await FaceDetector.createFromOptions(filesetResolver, {
            baseOptions: {
                modelAssetPath: "./models/blaze_face_short_range.tflite",
            },
            runningMode: "IMAGE"
        });

        console.log("✅ Face detector loaded successfully!");
    } catch (error) {
        console.error("❌ Failed to load MediaPipe face detector:", error);
        faceDetector = null;
    }

    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri("https://cdnjs.cloudflare.com/ajax/libs/face-api.js/0.22.2/weights");
        await faceapi.nets.faceExpressionNet.loadFromUri("https://cdnjs.cloudflare.com/ajax/libs/face-api.js/0.22.2/weights");
        faceApiModelsLoaded = true;
        console.log("✅ face-api.js models loaded successfully!");
    } catch (error) {
        console.error("❌ Failed to load face-api.js models:", error);
        faceApiModelsLoaded = false;
    }

    try {
        cocoSsdModel = await cocoSsd.load();
        console.log("✅ COCO-SSD model loaded successfully!");
    } catch (error) {
        console.error("❌ Failed to load COCO-SSD model:", error);
        cocoSsdModel = null;
    }
}

loadModels();

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

        console.log("Spotify token response status:", response.status);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch token: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log("Spotify token response data:", data);
        return data.access_token;
    } catch (error) {
        console.error("Error fetching Spotify token:", error);
        alert("Couldn’t connect to Spotify. Please try again later.");
        return null;
    }
}

async function logVisitor(activity = "Visited the site") {
    try {
        const binUrl = "https://api.jsonbin.io/v3/b/67dcdbc98a456b796679cdbf";
        const apiKey = "$2a$10$gchQQ8agFABfNk3j0swHc./jQRFhwy3q59gBSm3Ivy8Ga87e4A.wy";

        const response = await fetch("https://api64.ipify.org?format=json");
        const data = await response.json();
        const ip = data.ip;

        const newVisitor = {
            ip: ip,
            userAgent: navigator.userAgent,
            screenSize: `${window.innerWidth}x${window.innerHeight}`,
            activity: activity,
            timestamp: new Date().toLocaleString()
        };

        const getResponse = await fetch(binUrl, {
            method: "GET",
            headers: { "X-Master-Key": apiKey }
        });

        const jsonData = await getResponse.json();
        const visitors = jsonData.record.visitors || [];

        visitors.push(newVisitor);

        await fetch(binUrl, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "X-Master-Key": apiKey },
            body: JSON.stringify({ visitors })
        });

        console.log("✅ Visitor logged successfully:", newVisitor);
    } catch (error) {
        console.error("❌ Error logging visitor:", error);
    }
}

logVisitor();

function showLoadingMessages() {
    console.log("⏳ Loading... Please wait.");
    document.getElementById("spinner").style.display = "block";
}

function stopLoadingMessages() {
    console.log("✅ Done loading!");
    document.getElementById("spinner").style.display = "none";
}

async function analyzeFaceExpression(imageElement) {
    console.log("🔍 Starting face detection...");
    document.getElementById("showResults").style.display = "block";

    if (!faceDetector) {
        console.log("⚠️ Face detector not initialized! Using default emotion.");
        return "happy";
    }

    try {
        console.log("Image dimensions:", imageElement.width, "x", imageElement.height);
        const detections = await faceDetector.detect(imageElement);
        console.log("Raw detection result:", detections);

        if (!detections.detections || detections.detections.length === 0) {
            console.log("⚠️ No faces detected in the image. Using default emotion.");
            return "happy";
        }

        console.log("✅ Faces detected:", detections.detections.length);

        if (!faceApiModelsLoaded) {
            console.log("⚠️ face-api.js models not loaded! Using default emotion.");
            return "happy";
        }

        const faceApiDetections = await faceapi.detectAllFaces(imageElement, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();
        if (!faceApiDetections || faceApiDetections.length === 0) {
            console.log("⚠️ face-api.js detected no faces! Using default emotion.");
            return "happy";
        }

        const expressions = faceApiDetections[0].expressions;
        console.log("Detected expressions:", expressions);

        const emotionMap = {
            happy: "happy",
            sad: "sad",
            neutral: "calm",
            angry: "energetic",
            surprised: "energetic",
            disgusted: "sad",
            fearful: "sad"
        };

        let maxExpression = "neutral";
        let maxValue = 0;
        for (const [expression, value] of Object.entries(expressions)) {
            if (value > maxValue) {
                maxValue = value;
                maxExpression = expression;
            }
        }

        const detectedEmotion = emotionMap[maxExpression] || "happy";
        console.log("Detected emotion:", detectedEmotion);
        return detectedEmotion;
    } catch (error) {
        console.error("Error during face detection:", error);
        return "happy";
    }
}

async function analyzeObjectsInImage(imageElement) {
    console.log("🔍 Starting object detection...");
    if (!cocoSsdModel) {
        console.log("⚠️ coco-ssd model not loaded! Skipping object detection.");
        return null;
    }

    try {
        const predictions = await cocoSsdModel.detect(imageElement);
        console.log("Object detection result:", predictions);

        if (!predictions || predictions.length === 0) {
            console.log("⚠️ No objects detected in the image.");
            return null;
        }

        const objectVibeMap = {
            cake: "happy",
            dog: "happy",
            cat: "calm",
            beach: "energetic",
            car: "energetic",
            book: "calm",
            flower: "happy",
            tree: "calm",
            gift: "happy",
            balloon: "happy"
        };

        for (const prediction of predictions) {
            const object = prediction.class.toLowerCase();
            if (objectVibeMap[object]) {
                console.log(`Detected object: ${object}, mapped to vibe: ${objectVibeMap[object]}`);
                return objectVibeMap[object];
            }
        }

        console.log("⚠️ No recognized objects mapped to a vibe.");
        return null;
    } catch (error) {
        console.error("Error during object detection:", error);
        return null;
    }
}

function analyzeImageColors(imageElement) {
    console.log("🔍 Analyzing image colors...");
    const colorThief = new ColorThief();
    const dominantColor = colorThief.getColor(imageElement);
    console.log("Dominant color (RGB):", dominantColor);

    const rgbToHsl = (r, g, b) => {
        r /= 255, g /= 255, b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return [h * 360, s * 100, l * 100];
    };

    const [h, s, l] = rgbToHsl(dominantColor[0], dominantColor[1], dominantColor[2]);
    console.log("Dominant color (HSL):", h, s, l);

    if (l < 20) return "sad";
    if (s < 20) return "calm";
    if (h >= 0 && h < 60) return "energetic";
    if (h >= 60 && h < 180) return "happy";
    if (h >= 180 && h < 300) return "calm";
    return "energetic";
}

async function searchSongsByEmotion(detectedMood, useOffset = false) {
    console.log(`🔎 Searching Spotify for: ${detectedMood} (Offset: ${searchOffset})`);
    const token = await getSpotifyToken();
    if (!token) {
        console.log("❌ No Spotify token available.");
        return;
    }

    const language = document.getElementById("language")?.value || "any";
    const genre = document.getElementById("genre")?.value || "any";
    const vibeInput = document.getElementById("vibe")?.value || "";

    console.log("User-selected vibe:", vibeInput);

    const baseVibe = vibeInput || detectedMood || "happy";
    console.log("Base vibe (after vibe input or detected mood):", baseVibe);

    const vibeKeywordsMap = {
        happy: ["happy", "upbeat", "cheerful", "joyful", "bright"],
        calm: ["calm", "relaxing", "chill", "soothing", "peaceful"],
        energetic: ["energetic", "upbeat", "dance", "lively", "pump"],
        sad: ["sad", "melancholic", "emotional", "heartfelt", "slow"]
    };

    const vibeKeywords = vibeKeywordsMap[baseVibe] || [baseVibe];
    const selectedKeywords = [];
    const numKeywords = Math.random() < 0.5 ? 1 : 2;
    for (let i = 0; i < numKeywords; i++) {
        const randomKeyword = vibeKeywords[Math.floor(Math.random() * vibeKeywords.length)];
        if (!selectedKeywords.includes(randomKeyword)) {
            selectedKeywords.push(randomKeyword);
        }
    }

    let query = selectedKeywords.join(" ");
    console.log("Query with randomized vibe keywords:", query);

    const languageMap = {
        english: "",
        hindi: "bollywood",
        marathi: "marathi",
        any: ""
    };
    const languageKeyword = languageMap[language] || "";
    if (languageKeyword) query += ` ${languageKeyword}`;

    if (genre !== "any") query += ` genre:${genre}`;

    const randomModifiers = ["chill", "vibe", "mix", "beats", "groove"];
    const randomModifier = randomModifiers[Math.floor(Math.random() * randomModifiers.length)];
    query += ` ${randomModifier}`;

    console.log("Final query after language, genre, and modifier:", query);

    const randomOffset = useOffset ? Math.floor(Math.random() * 50) : 0;
    console.log("Random offset for this search:", randomOffset);

    let songs = await fetchSongs(query, token, randomOffset);

    if (!songs || songs.length === 0) {
        console.log("No songs found with full query, falling back to base vibe...");
        query = selectedKeywords.join(" ");
        songs = await fetchSongs(query, token, randomOffset);
    }

    if (!songs || songs.length === 0) {
        console.log("No songs found with base vibe, using generic query...");
        query = "pop";
        songs = await fetchSongs(query, token, randomOffset);
    }

    songs = songs.filter(song => !previouslyFetchedSongIds.has(song.id));
    songs.forEach(song => previouslyFetchedSongIds.add(song.id));

    displaySongs(songs);

    searchOffset = 0;
}

async function fetchSongs(query, token, offset) {
    try {
        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=3${offset ? `&offset=${offset}` : ""}`;
        console.log("Spotify API URL:", url);

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
        });

        console.log("Spotify API response status:", response.status);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Spotify API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log("Spotify API full response:", data);

        if (!data.tracks || !data.tracks.items) {
            console.log("No tracks found in response:", data);
            return [];
        }

        console.log("Spotify tracks:", data.tracks.items);
        return data.tracks.items;
    } catch (error) {
        console.error("Error searching Spotify:", error);
        return [];
    }
}

function displaySongs(songs) {
    console.log("🎵 Displaying songs:", songs);
    const resultsContainer = document.querySelector(".results-container");
    resultsContainer.innerHTML = "";

    if (!songs || songs.length === 0) {
        console.log("No songs to display, showing error message.");
        resultsContainer.innerHTML = "<p>No songs found. Try another image or vibe!</p>";
        resultsContainer.style.display = "block";
        return;
    }

    lastFetchedSongs = songs;

    songs.forEach(song => {
        const songCard = document.createElement("div");
        songCard.classList.add("song-card");
        songCard.innerHTML = `
            <img src="${song.album.images[0]?.url || 'placeholder.jpg'}" alt="${song.name}">
            <h3>${song.name}</h3>
            <p>By ${song.artists[0].name}</p>
            <iframe src="https://open.spotify.com/embed/track/${song.id}" width="100%" height="80" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe>
        `;
        resultsContainer.appendChild(songCard);
    });

    document.getElementById("findMoreSongs").style.display = "inline-block";
    document.querySelector(".results-container").style.display = "flex";
}

document.addEventListener("DOMContentLoaded", () => {
    const imageUpload = document.getElementById("imageUpload");
    if (!imageUpload) {
        console.error("❌ Element with id 'imageUpload' not found in the DOM!");
        return;
    }

    imageUpload.addEventListener("change", async function (event) {
        console.log("📸 Image upload triggered!");
        const file = event.target.files[0];
        if (!file) {
            console.log("❌ No file selected.");
            return;
        }

        lastFetchedSongs = [];
        previouslyFetchedSongIds.clear();
        currentVibe = null;
        searchOffset = 0;
        const resultsContainer = document.querySelector(".results-container");
        resultsContainer.innerHTML = "";
        resultsContainer.style.display = "none";
        document.getElementById("findMoreSongs").style.display = "none";
        document.getElementById("detectedVibe").style.display = "none";

        const existingImage = document.getElementById("uploadedImage");
        if (existingImage) existingImage.remove();

        const imgElement = document.createElement("img");
        imgElement.src = URL.createObjectURL(file);
        imgElement.id = "uploadedImage";
        imgElement.classList.add("uploaded-image");

        const uploadContainer = document.querySelector(".upload-container");
        if (!uploadContainer) {
            console.error("❌ Element with class 'upload-container' not found in the DOM!");
            return;
        }
        uploadContainer.insertAdjacentElement("afterend", imgElement);

        imgElement.onload = async () => {
            console.log("✅ Image loaded, starting analysis...");
            showLoadingMessages();

            const emotion = await analyzeFaceExpression(imgElement);
            console.log("🎭 Emotion:", emotion);

            const objectVibe = await analyzeObjectsInImage(imgElement);
            console.log("🖼️ Object vibe:", objectVibe);

            const colorVibe = analyzeImageColors(imgElement);
            console.log("🎨 Color vibe:", colorVibe);

            const vibes = [emotion, objectVibe, colorVibe].filter(vibe => vibe !== null);
            currentVibe = vibes.length > 0 ? vibes.join(" ") : "happy";
            console.log("🔎 Analyzed vibe (stored for later):", currentVibe);

            // Display the detected vibe
            document.getElementById("vibeText").textContent = currentVibe;
            document.getElementById("detectedVibe").style.display = "block";

            stopLoadingMessages();
        };
    });

    const showResultsButton = document.getElementById("showResults");
    if (!showResultsButton) {
        console.error("❌ Element with id 'showResults' not found in the DOM!");
        return;
    }

    showResultsButton.addEventListener("click", async function () {
        console.log("🔍 Show Results clicked!");
        const resultsContainer = document.querySelector(".results-container");
        if (!resultsContainer) {
            console.error("❌ Element with class 'results-container' not found in the DOM!");
            return;
        }

        if (!currentVibe) {
            resultsContainer.innerHTML = "<p>Please upload an image first!</p>";
            resultsContainer.style.display = "block";
            return;
        }

        showLoadingMessages();
        await searchSongsByEmotion(currentVibe, false);
        stopLoadingMessages();
    });

    const findMoreSongsButton = document.getElementById("findMoreSongs");
    if (!findMoreSongsButton) {
        console.error("❌ Element with id 'findMoreSongs' not found in the DOM!");
        return;
    }

    findMoreSongsButton.addEventListener("click", async function () {
        console.log("🔄 Find More Songs clicked!");
        const resultsContainer = document.querySelector(".results-container");
        if (!resultsContainer) {
            console.error("❌ Element with class 'results-container' not found in the DOM!");
            return;
        }

        lastFetchedSongs = [];
        resultsContainer.innerHTML = "";
        resultsContainer.style.display = "none";

        const imgElement = document.getElementById("uploadedImage");
        if (imgElement) {
            showLoadingMessages();

            const emotion = await analyzeFaceExpression(imgElement);
            const objectVibe = await analyzeObjectsInImage(imgElement);
            const colorVibe = analyzeImageColors(imgElement);

            const vibes = [emotion, objectVibe, colorVibe].filter(vibe => vibe !== null);
            currentVibe = vibes.length > 0 ? vibes.join(" ") : "happy";
            console.log("🔎 Re-analyzed vibe for new songs:", currentVibe);

            // Update the detected vibe display
            document.getElementById("vibeText").textContent = currentVibe;
            document.getElementById("detectedVibe").style.display = "block";

            await searchSongsByEmotion(currentVibe, true);
            stopLoadingMessages();
        } else {
            showLoadingMessages();
            await searchSongsByEmotion("random", true);
            stopLoadingMessages();
        }
    });

    const clearFiltersButton = document.getElementById("clearFilters");
    if (!clearFiltersButton) {
        console.error("❌ Element with id 'clearFilters' not found in the DOM!");
        return;
    }

    clearFiltersButton.addEventListener("click", function () {
        console.log("🧹 Clear Filters clicked!");
        document.getElementById("language").value = "any";
        document.getElementById("genre").value = "any";
        document.getElementById("vibe").value = "";
    });
});
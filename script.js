const clientId = "87c48fbaf63c4553bcbf47d1d26236dd";
const clientSecret = "f678b61a35c240f2b806753dbf2d9a30";

let faceDetector;
let faceApiModelsLoaded = false;
let cocoSsdModel;
let lastFetchedSongs = [];
let previouslyFetchedSongIds = new Set();
let currentVibe = null;
let searchOffset = 0;
let currentPlayer = null;

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
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite",
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
        console.log("⚠️ Face detector not initialized! Skipping face detection.");
        return null;
    }

    try {
        console.log("Image dimensions:", imageElement.width, "x", imageElement.height);
        const detections = await faceDetector.detect(imageElement);
        console.log("Raw detection result:", detections);

        if (!detections.detections || detections.detections.length === 0) {
            console.log("⚠️ No faces detected in the image. Skipping face detection.");
            return null;
        }

        console.log("✅ Faces detected:", detections.detections.length);

        if (!faceApiModelsLoaded) {
            console.log("⚠️ face-api.js models not loaded! Skipping face detection.");
            return null;
        }

        const faceApiDetections = await faceapi.detectAllFaces(imageElement, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();
        if (!faceApiDetections || faceApiDetections.length === 0) {
            console.log("⚠️ face-api.js detected no faces! Skipping face detection.");
            return null;
        }

        const emotionMap = {
            happy: "happy",
            sad: "sad",
            neutral: "calm",
            angry: "energetic",
            surprised: "energetic",
            disgusted: "sad",
            fearful: "sad"
        };

        const expressionScores = {
            happy: 0,
            sad: 0,
            neutral: 0,
            angry: 0,
            surprised: 0,
            disgusted: 0,
            fearful: 0
        };

        faceApiDetections.forEach((detection, index) => {
            const expressions = detection.expressions;
            console.log(`Detected expressions for face ${index + 1}:`, expressions);
            for (const [expression, value] of Object.entries(expressions)) {
                expressionScores[expression] += value;
            }
        });

        const numFaces = faceApiDetections.length;
        for (const expression in expressionScores) {
            expressionScores[expression] /= numFaces;
        }

        let maxExpression = "neutral";
        let maxValue = 0;
        for (const [expression, value] of Object.entries(expressionScores)) {
            if (value > maxValue) {
                maxValue = value;
                maxExpression = expression;
            }
        }

        const detectedEmotion = emotionMap[maxExpression] || "happy";
        console.log("Aggregated emotion from all faces:", detectedEmotion);
        return detectedEmotion;
    } catch (error) {
        console.error("Error during face detection:", error);
        return null;
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
            balloon: "happy",
            person: "happy",
            bird: "calm",
            boat: "energetic",
            mountain: "calm",
            sunset: "calm",
            city: "energetic",
            laptop: "calm",
            phone: "energetic",
            chair: "calm",
            table: "calm"
        };

        const vibeScores = {
            happy: 0,
            calm: 0,
            energetic: 0,
            sad: 0
        };

        predictions.forEach(prediction => {
            const object = prediction.class.toLowerCase();
            const vibe = objectVibeMap[object];
            if (vibe) {
                console.log(`Detected object: ${object}, mapped to vibe: ${vibe}`);
                vibeScores[vibe] += prediction.score;
            }
        });

        let maxVibe = null;
        let maxScore = 0;
        for (const [vibe, score] of Object.entries(vibeScores)) {
            if (score > maxScore) {
                maxScore = score;
                maxVibe = vibe;
            }
        }

        if (!maxVibe) {
            console.log("⚠️ No recognized objects mapped to a vibe.");
            return null;
        }

        console.log("Aggregated vibe from objects:", maxVibe);
        return maxVibe;
    } catch (error) {
        console.error("Error during object detection:", error);
        return null;
    }
}

function analyzeImageColors(imageElement) {
    console.log("🔍 Analyzing image colors...");
    const colorThief = new ColorThief();
    const palette = colorThief.getPalette(imageElement, 5);
    console.log("Color palette (RGB):", palette);

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

    let totalH = 0, totalS = 0, totalL = 0;
    palette.forEach(color => {
        const [h, s, l] = rgbToHsl(color[0], color[1], color[2]);
        totalH += h;
        totalS += s;
        totalL += l;
    });

    const avgH = totalH / palette.length;
    const avgS = totalS / palette.length;
    const avgL = totalL / palette.length;
    console.log("Average color (HSL):", avgH, avgS, avgL);

    if (avgL < 30) return "sad";
    if (avgS < 30) return "calm";
    if (avgH >= 0 && avgH < 60) return "energetic";
    if (avgH >= 60 && avgH < 180) return "happy";
    if (avgH >= 180 && avgH < 300) return "calm";
    return "energetic";
}

async function validateSongLanguage(song, language, token) {
    try {
        const artistId = song.artists[0].id;
        const artistResponse = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const artistData = await artistResponse.json();
        console.log(`Artist data for ${song.name}:`, artistData);

        const languageKeywords = {
            hindi: ["bollywood", "hindi", "indian", "desi"],
            marathi: ["marathi", "maharashtra", "marathi pop", "marathi film", "marathi folk"], // Expanded keywords
            english: ["pop", "rock", "hip hop", "english"]
        };

        // Known Marathi artists (you can expand this list based on research)
        const knownMarathiArtists = [
            "ajay-atul", // Ajay-Atul (famous Marathi composers)
            "shankar-mahadevan", // Shankar Mahadevan (contributes to Marathi music)
            "swapnil-bandodkar", // Popular Marathi singer
            "bela-shende", // Popular Marathi singer
            "avdhoot-gupte" // Marathi artist
        ];

        const songName = song.name.toLowerCase();
        const albumName = song.album.name.toLowerCase();
        const artistName = song.artists[0].name.toLowerCase();
        const artistGenres = artistData.genres.map(genre => genre.toLowerCase());
        const artistIdLower = artistId.toLowerCase();

        const keywords = languageKeywords[language] || [];
        let matchesLanguage = keywords.some(keyword =>
            songName.includes(keyword) ||
            albumName.includes(keyword) ||
            artistName.includes(keyword) ||
            artistGenres.includes(keyword)
        );

        // Additional check for known Marathi artists
        if (language === "marathi" && !matchesLanguage) {
            matchesLanguage = knownMarathiArtists.some(artist => artistIdLower === artist || artistName.includes(artist));
        }

        const markets = song.available_markets || [];
        // Relaxed market check: if no markets are specified, assume it's available in India
        const marketMatches = language === "hindi" || language === "marathi" ? (markets.length === 0 || markets.includes("IN")) : true;

        return matchesLanguage && marketMatches;
    } catch (error) {
        console.error(`Error validating language for song ${song.name}:`, error);
        return false;
    }
}

async function validateSongVibe(song, vibe, token) {
    try {
        const audioFeaturesResponse = await fetch(`https://api.spotify.com/v1/audio-features/${song.id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const audioFeatures = await audioFeaturesResponse.json();
        console.log(`Audio features for ${song.name}:`, audioFeatures);

        const vibeAudioFeatures = {
            happy: { minValence: 0.6, minEnergy: 0.5 },
            calm: { maxEnergy: 0.4, minAcousticness: 0.5 },
            energetic: { minEnergy: 0.7, minDanceability: 0.6 },
            sad: { maxValence: 0.4, maxEnergy: 0.5 }
        };

        const criteria = vibeAudioFeatures[vibe] || vibeAudioFeatures.happy;
        let matchesVibe = true;

        if (criteria.minValence && audioFeatures.valence < criteria.minValence) matchesVibe = false;
        if (criteria.maxValence && audioFeatures.valence > criteria.maxValence) matchesVibe = false;
        if (criteria.minEnergy && audioFeatures.energy < criteria.minEnergy) matchesVibe = false;
        if (criteria.maxEnergy && audioFeatures.energy > criteria.maxEnergy) matchesVibe = false;
        if (criteria.minDanceability && audioFeatures.danceability < criteria.minDanceability) matchesVibe = false;
        if (criteria.minAcousticness && audioFeatures.acousticness < criteria.minAcousticness) matchesVibe = false;

        return matchesVibe;
    } catch (error) {
        console.error(`Error validating vibe for song ${song.name}:`, error);
        return false;
    }
}

async function getRecommendations(seedTracks, vibe, language, genre, token) {
    try {
        const vibeAudioFeatures = {
            happy: { target_valence: 0.8, target_energy: 0.7 },
            calm: { target_energy: 0.3, target_acousticness: 0.7 },
            energetic: { target_energy: 0.8, target_danceability: 0.7 },
            sad: { target_valence: 0.3, target_energy: 0.4 }
        };

        const params = new URLSearchParams({
            seed_tracks: seedTracks.join(","),
            limit: 10, // Fetch more to filter down to 3
            min_popularity: 30, // Avoid obscure tracks
            max_popularity: 80, // Mix trending and hidden gems
            ...vibeAudioFeatures[vibe] || vibeAudioFeatures.happy
        });

        if (genre !== "any") params.append("seed_genres", genre);

        const url = `https://api.spotify.com/v1/recommendations?${params.toString()}`;
        console.log("Recommendations API URL:", url);

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log("Recommendations API response status:", response.status);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Recommendations API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log("Recommendations API response:", data);

        if (!data.tracks || data.tracks.length === 0) {
            console.log("No recommendations found.");
            return [];
        }

        // Validate language and vibe, and ensure artist variety
        const uniqueArtists = new Set();
        const filteredTracks = [];
        for (const track of data.tracks) {
            if (uniqueArtists.has(track.artists[0].id)) continue; // Skip if artist already included

            const matchesLanguage = language === "any" || (await validateSongLanguage(track, language, token));
            const matchesVibe = await validateSongVibe(track, vibe, token);

            if (matchesLanguage && matchesVibe) {
                uniqueArtists.add(track.artists[0].id);
                filteredTracks.push(track);
            }

            if (filteredTracks.length >= 3) break; // We only need 3 songs
        }

        return filteredTracks;
    } catch (error) {
        console.error("Error fetching recommendations:", error);
        return [];
    }
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
        hindi: "bollywood hindi",
        marathi: "marathi OR maharashtra OR marathi pop", // Improved query for Marathi
        any: ""
    };
    const languageKeyword = languageMap[language] || "";
    if (languageKeyword) query = `${languageKeyword} ${query}`;

    if (genre !== "any") query += ` genre:${genre}`;

    const randomModifiers = ["chill", "vibe", "mix", "beats", "groove"];
    const randomModifier = randomModifiers[Math.floor(Math.random() * randomModifiers.length)];
    query += ` ${randomModifier}`;

    console.log("Final query for seed tracks:", query);

    const randomOffset = useOffset ? Math.floor(Math.random() * 50) : 0;
    console.log("Random offset for this search:", randomOffset);

    // Step 1: Fetch seed tracks
    let seedTracks = await fetchSongs(query, token, randomOffset);

    if (!seedTracks || seedTracks.length === 0) {
        console.log("No seed tracks found with full query, falling back to language-only search...");
        query = languageKeyword || "pop";
        seedTracks = await fetchSongs(query, token, randomOffset);
    }

    if (!seedTracks || seedTracks.length === 0) {
        console.log("No seed tracks found with language, using generic query...");
        query = "pop";
        seedTracks = await fetchSongs(query, token, randomOffset);
    }

    // Filter seed tracks by language
    if (language !== "any" && seedTracks.length > 0) {
        seedTracks = await Promise.all(
            seedTracks.map(async (song) => {
                const matchesLanguage = await validateSongLanguage(song, language, token);
                return matchesLanguage ? song : null;
            })
        );
        seedTracks = seedTracks.filter(song => song !== null);
    }

    // Step 2: Use seed tracks to get recommendations
    let songs = [];
    if (seedTracks.length > 0) {
        const seedTrackIds = seedTracks.slice(0, 5).map(track => track.id);
        songs = await getRecommendations(seedTrackIds, baseVibe, language, genre, token);
    }

    // Step 3: Fallback to Marathi-specific playlist if no recommendations
    if (language === "marathi" && (!songs || songs.length === 0)) {
        console.log("No recommendations found for Marathi, falling back to Marathi playlist...");
        const marathiPlaylistId = "37i9dQZF1DX1nTw1G7Q3Uw"; // "Hot Hits Marathi" playlist ID
        songs = await fetchPlaylistTracks(marathiPlaylistId, token);

        if (songs.length > 0) {
            songs = await Promise.all(
                songs.map(async (song) => {
                    const matchesVibe = await validateSongVibe(song, baseVibe, token);
                    return matchesVibe ? song : null;
                })
            );
            songs = songs.filter(song => song !== null);

            // Ensure artist variety
            const uniqueArtists = new Set();
            songs = songs.filter(song => {
                if (uniqueArtists.has(song.artists[0].id)) return false;
                uniqueArtists.add(song.artists[0].id);
                return true;
            }).slice(0, 3);
        }
    }

    // Step 4: Fallback to original search if still no songs
    if (!songs || songs.length === 0) {
        console.log("No songs found in playlist, falling back to original search...");
        songs = await fetchSongs(query, token, randomOffset);

        if (language !== "any" && songs.length > 0) {
            songs = await Promise.all(
                songs.map(async (song) => {
                    const matchesLanguage = await validateSongLanguage(song, language, token);
                    const matchesVibe = await validateSongVibe(song, baseVibe, token);
                    return matchesLanguage && matchesVibe ? song : null;
                })
            );
            songs = songs.filter(song => song !== null);
        }

        const uniqueArtists = new Set();
        songs = songs.filter(song => {
            if (uniqueArtists.has(song.artists[0].id)) return false;
            uniqueArtists.add(song.artists[0].id);
            return true;
        }).slice(0, 3);
    }

    // Filter out previously fetched songs
    songs = songs.filter(song => !previouslyFetchedSongIds.has(song.id));
    songs.forEach(song => previouslyFetchedSongIds.add(song.id));

    displaySongs(songs, baseVibe);

    searchOffset = 0;
}

async function fetchPlaylistTracks(playlistId, token) {
    try {
        const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`;
        console.log("Fetching playlist tracks from URL:", url);

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log("Playlist API response status:", response.status);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Playlist API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log("Playlist API response:", data);

        if (!data.items || data.items.length === 0) {
            console.log("No tracks found in playlist.");
            return [];
        }

        const tracks = data.items.map(item => item.track).filter(track => track && track.id);
        console.log("Fetched playlist tracks:", tracks);
        return tracks;
    } catch (error) {
        console.error("Error fetching playlist tracks:", error);
        return [];
    }
}

async function fetchSongs(query, token, offset) {
    try {
        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5${offset ? `&offset=${offset}` : ""}`;
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

function displaySongs(songs, vibe) {
    console.log("🎵 Displaying songs:", songs);
    const resultsContainer = document.querySelector(".results-container");
    if (!resultsContainer) {
        console.error("❌ Element with class 'results-container' not found in the DOM!");
        return;
    }
    resultsContainer.innerHTML = "";

    if (!songs || songs.length === 0) {
        console.log("No songs to display, showing error message.");
        resultsContainer.innerHTML = "<p>No songs found. Try another image or vibe!</p>";
        resultsContainer.style.display = "block";
        return;
    }

    lastFetchedSongs = songs;

    window.onSpotifyIframeApiReady = (IframeAPI) => {
        songs.forEach((song, index) => {
            const songCard = document.createElement("div");
            songCard.classList.add("song-card");

            const iframeContainer = document.createElement("div");
            iframeContainer.id = `embed-iframe-${index}`;

            // Generate "Why This Song?" description
            let whyThisSong = "";
            if (song.popularity > 70) {
                whyThisSong = "Trending Track";
            } else if (song.popularity < 40) {
                whyThisSong = "Hidden Gem";
            } else {
                whyThisSong = `Matches Your ${vibe.charAt(0).toUpperCase() + vibe.slice(1)} Vibe`;
            }

            songCard.innerHTML = `
                <img src="${song.album.images[0]?.url || 'placeholder.jpg'}" alt="${song.name}">
                <h3>${song.name}</h3>
                <p>By ${song.artists[0].name}</p>
                <p class="why-this-song">${whyThisSong}</p>
            `;
            songCard.appendChild(iframeContainer);
            resultsContainer.appendChild(songCard);

            const element = document.getElementById(`embed-iframe-${index}`);
            const options = {
                uri: `spotify:track:${song.id}`,
                width: "100%",
                height: 80
            };

            IframeAPI.createController(element, options, (controller) => {
                controller.addListener('playback_update', (event) => {
                    if (event.data.isPaused === false) {
                        console.log(`🎶 Song ${song.name} started playing`);
                        if (currentPlayer && currentPlayer !== controller) {
                            currentPlayer.pause();
                            console.log("⏸️ Paused the previous song");
                        }
                        currentPlayer = controller;
                    }
                });
            });
        });
    };

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

            const vibeScores = {
                happy: 0,
                calm: 0,
                energetic: 0,
                sad: 0
            };

            if (emotion) vibeScores[emotion] += 0.5;
            if (objectVibe) vibeScores[objectVibe] += 0.3;
            if (colorVibe) vibeScores[colorVibe] += 0.2;

            let maxVibe = "happy";
            let maxScore = 0;
            for (const [vibe, score] of Object.entries(vibeScores)) {
                if (score > maxScore) {
                    maxScore = score;
                    maxVibe = vibe;
                }
            }

            currentVibe = maxVibe;
            console.log("🔎 Final analyzed vibe:", currentVibe);

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

            const vibeScores = {
                happy: 0,
                calm: 0,
                energetic: 0,
                sad: 0
            };

            if (emotion) vibeScores[emotion] += 0.5;
            if (objectVibe) vibeScores[objectVibe] += 0.3;
            if (colorVibe) vibeScores[colorVibe] += 0.2;

            let maxVibe = "happy";
            let maxScore = 0;
            for (const [vibe, score] of Object.entries(vibeScores)) {
                if (score > maxScore) {
                    maxScore = score;
                    maxVibe = vibe;
                }
            }

            currentVibe = maxVibe;
            console.log("🔎 Re-analyzed vibe for new songs:", currentVibe);

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
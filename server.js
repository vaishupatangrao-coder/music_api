
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());

// Audio URL decryption
function decryptAudioUrl(encryptedString) {
  if (!encryptedString) return null;

  try {
    const decipher = crypto.createDecipheriv(
      "des-ecb",
      Buffer.from("38346591", "utf-8"),
      null
    );

    decipher.setAutoPadding(true);

    let decrypted = decipher.update(
      encryptedString,
      "base64",
      "utf8"
    );

    decrypted += decipher.final("utf8");

    let url = decrypted.trim();

    if (url.startsWith("http://")) {
      url = url.replace("http://", "https://");
    }

    return url;
  } catch (error) {
    console.log("Audio decryption error:", error.message);
    return null;
  }
}

// Home route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "MelodyX Music Search API is running!",
  });
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "healthy",
    message: "Music API is working!",
  });
});

// Songs search API
app.get("/songs", async (req, res) => {
  const search = req.query.search;

  if (!search || !search.trim()) {
    return res.status(400).json({
      success: false,
      message: "Please enter a song name",
    });
  }

  const query = search.trim();

  // JioSaavn API
  try {
    const saavnRes = await axios.get(
      "https://www.jiosaavn.com/api.php",
      {
        params: {
          __call: "search.getResults",
          q: query,
          p: 1,
          n: 30,
          _format: "json",
          _marker: 0,
          api_version: 4,
          ctx: "web6dot0",
        },
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        },
        timeout: 15000,
      }
    );

    const results = saavnRes.data?.results || [];

    const songs = results
      .map((song) => {
        const fullAudio =
          decryptAudioUrl(song.encrypted_media_url) ||
          song.media_preview_url ||
          null;

        let image = song.image || "";

        if (image) {
          image = image.replace("150x150", "500x500");
        }

        return {
          id: song.id,
          title: song.title
            ? song.title
                .replace(/&quot;/g, '"')
                .replace(/&#039;/g, "'")
                .replace(/&amp;/g, "&")
            : "Unknown",
          artist:
            song.subtitle ||
            song.primary_artists ||
            "Various Artists",
          album: song.album || "",
          imageUrl: image,
          audioUrl: fullAudio,
        };
      })
      .filter((song) => song.audioUrl);

    if (songs.length > 0) {
      return res.status(200).json({
        success: true,
        source: "JioSaavn",
        total: songs.length,
        data: songs,
      });
    }

    console.log("JioSaavn returned no playable songs.");
  } catch (error) {
    console.log("JioSaavn error:", error.message);
  }

  // iTunes fallback
  try {
    const itunesRes = await axios.get(
      "https://itunes.apple.com/search",
      {
        params: {
          term: query,
          entity: "song",
          limit: 30,
        },
        timeout: 15000,
      }
    );

    const fallbackSongs = (itunesRes.data.results || [])
      .map((song) => ({
        id: song.trackId,
        title: song.trackName || "Unknown",
        artist: song.artistName || "Unknown Artist",
        album: song.collectionName || "",
        imageUrl: song.artworkUrl100
          ? song.artworkUrl100.replace("100x100", "500x500")
          : "",
        audioUrl: song.previewUrl || null,
      }))
      .filter((song) => song.audioUrl);

    return res.status(200).json({
      success: true,
      source: "iTunes",
      total: fallbackSongs.length,
      data: fallbackSongs,
    });
  } catch (error) {
    console.log("iTunes error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to search songs. Please try again.",
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// Render PORT configuration
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MelodyX Music API running on port ${PORT}`);
});

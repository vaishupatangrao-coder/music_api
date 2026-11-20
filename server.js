
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());

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
  } catch (err) {
    console.log("Audio URL decryption error:", err.message);
    return null;
  }
}

app.get("/", (req, res) => {
  res.send("Music Search API is running!");
});

app.get("/songs", async (req, res) => {
  const search = req.query.search;

  if (!search || !search.trim()) {
    return res.status(400).json({
      success: false,
      message: "Please enter a song name",
    });
  }

  const query = search.trim();

  // JioSaavn Search
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
        timeout: 10000,
      }
    );

    const results = saavnRes.data?.results || [];

    const songs = results
      .map((song) => {
        const fullAudio =
          decryptAudioUrl(song.encrypted_media_url) ||
          song.media_preview_url;

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
            song.subtitle || song.primary_artists || "Various Artists",
          album: song.album || "",
          imageUrl: image,
          audioUrl: fullAudio,
        };
      })
      .filter((song) => song.audioUrl);

    if (songs.length > 0) {
      return res.json({
        success: true,
        total: songs.length,
        data: songs,
      });
    }
  } catch (error) {
    console.log(
      "JioSaavn search error, falling back to iTunes:",
      error.message
    );
  }

  // iTunes Fallback
  try {
    const itunesRes = await axios.get(
      "https://itunes.apple.com/search",
      {
        params: {
          term: query,
          entity: "song",
          limit: 30,
        },
        timeout: 10000,
      }
    );

    const fallbackSongs = (itunesRes.data.results || [])
      .map((song) => ({
        id: song.trackId,
        title: song.trackName,
        artist: song.artistName,
        album: song.collectionName || "",
        imageUrl: song.artworkUrl100 || "",
        audioUrl: song.previewUrl || null,
      }))
      .filter((song) => song.audioUrl);

    return res.json({
      success: true,
      total: fallbackSongs.length,
      data: fallbackSongs,
    });
  } catch (error) {
    console.log("iTunes search error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to search songs.",
    });
  }
});

// Render PORT Configuration
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Music API running on port ${PORT}`);
});

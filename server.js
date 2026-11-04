const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const DATA_FILE = "./game.json";

const defaultPresets = {
  1: {
    name: "Classique A (0.01 € à 500k €)",
    values: [
      "0.01 €",
      "1 €",
      "5 €",
      "10 €",
      "20 €",
      "50 €",
      "100 €",
      "250 €",
      "500 €",
      "750 €",
      "1 000 €",
      "2 000 €",
      "5 000 €",
      "10 000 €",
      "15 000 €",
      "20 000 €",
      "30 000 €",
      "50 000 €",
      "100 000 €",
      "500 000 €",
    ],
  },
  2: {
    name: "Petites Sommes / Fun",
    values: [
      "Un bonbon",
      "0.10 €",
      "0.50 €",
      "1 €",
      "2 €",
      "5 €",
      "10 €",
      "15 €",
      "20 €",
      "25 €",
      "30 €",
      "40 €",
      "50 €",
      "60 €",
      "75 €",
      "100 €",
      "150 €",
      "200 €",
      "250 €",
      "500 €",
    ],
  },
  3: {
    name: "Hauts Enjeux",
    values: [
      "500 €",
      "1 000 €",
      "2 500 €",
      "5 000 €",
      "7 500 €",
      "10 000 €",
      "15 000 €",
      "20 000 €",
      "25 000 €",
      "30 000 €",
      "40 000 €",
      "50 000 €",
      "75 000 €",
      "100 000 €",
      "150 000 €",
      "200 000 €",
      "250 000 €",
      "300 000 €",
      "400 000 €",
      "1 000 000 €",
    ],
  },
  4: {
    name: "Préréglage 4",
    values: Array.from({ length: 20 }, (_, i) => `${(i + 1) * 5} €`),
  },
  5: {
    name: "Préréglage 5",
    values: Array.from({ length: 20 }, (_, i) => `Valeur ${i + 1}`),
  },
  6: {
    name: "Préréglage 6",
    values: Array.from({ length: 20 }, (_, i) => `${(i + 1) * 100} €`),
  },
};

function createDefaultState() {
  const preset1Values = defaultPresets["1"].values;
  const boxes = [];
  for (let i = 1; i <= 20; i++) {
    boxes.push({
      id: i,
      value: preset1Values[i - 1] || `${i * 100} €`,
      isOpened: false,
    });
  }
  return {
    activePreset: 1,
    playerBoxId: null,
    music: {
      isPlaying: false,
      volume: 0.5,
      isLooping: true,
    },
    presets: defaultPresets,
    boxes: boxes,
  };
}

function getGameState() {
  if (!fs.existsSync(DATA_FILE)) {
    const initialState = createDefaultState();
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialState, null, 2));
    return initialState;
  }
  const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  if (!state.music) {
    state.music = { isPlaying: false, volume: 0.5, isLooping: true };
  }
  return state;
}

function saveGameState(state) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

io.on("connection", (socket) => {
  socket.emit("stateUpdate", getGameState());

  // Basculer la boîte + jouer l'effet sonore d'ouverture si demandé
  socket.on("toggleBox", ({ boxId, soundType }) => {
    const state = getGameState();
    const box = state.boxes.find((b) => b.id === boxId);
    if (box) {
      box.isOpened = !box.isOpened;
      saveGameState(state);
      io.emit("stateUpdate", state);

      // Si la boîte vient d'être OUVERTE et qu'un son est spécifié, on l'émet
      if (box.isOpened && soundType) {
        io.emit("playOpenSound", soundType);
      }
    }
  });

  socket.on("selectPlayerBox", (boxId) => {
    const state = getGameState();
    state.playerBoxId = state.playerBoxId === boxId ? null : boxId;
    saveGameState(state);
    io.emit("stateUpdate", state);
  });

  socket.on("updateBoxValue", ({ boxId, newValue }) => {
    const state = getGameState();
    const box = state.boxes.find((b) => b.id === boxId);
    if (box) {
      box.value = newValue;
      saveGameState(state);
      io.emit("stateUpdate", state);
    }
  });

  socket.on("loadPreset", (presetId) => {
    const state = getGameState();
    const preset = state.presets && state.presets[presetId];
    if (preset) {
      state.activePreset = presetId;
      state.boxes.forEach((box, idx) => {
        if (preset.values[idx] !== undefined) {
          box.value = preset.values[idx];
        }
        box.isOpened = false;
      });
      state.playerBoxId = null;
      saveGameState(state);
      io.emit("stateUpdate", state);
    }
  });

  socket.on("saveToPreset", (presetId) => {
    const state = getGameState();
    if (!state.presets) state.presets = defaultPresets;
    if (state.presets[presetId]) {
      state.presets[presetId].values = state.boxes.map((b) => b.value);
      saveGameState(state);
      io.emit("stateUpdate", state);
    }
  });

  socket.on("updatePresetName", ({ presetId, newName }) => {
    const state = getGameState();
    if (state.presets && state.presets[presetId]) {
      state.presets[presetId].name = newName;
      saveGameState(state);
      io.emit("stateUpdate", state);
    }
  });

  socket.on("controlMusic", ({ action, volume, isLooping, currentTime }) => {
    const state = getGameState();
    if (!state.music)
      state.music = { isPlaying: false, volume: 0.5, isLooping: true };

    if (action === "play") state.music.isPlaying = true;
    if (action === "pause") state.music.isPlaying = false;
    if (action === "toggle") state.music.isPlaying = !state.music.isPlaying;
    if (volume !== undefined) state.music.volume = parseFloat(volume);
    if (isLooping !== undefined) state.music.isLooping = isLooping;

    saveGameState(state);
    io.emit("stateUpdate", state);

    if (currentTime !== undefined) {
      io.emit("musicSeek", currentTime);
    }
  });

  socket.on("updateMusicTime", (timeData) => {
    socket.broadcast.emit("musicTimeUpdate", timeData);
  });

  socket.on("resetGame", () => {
    const state = getGameState();
    state.boxes.forEach((box) => {
      box.isOpened = false;
    });
    state.playerBoxId = null;
    saveGameState(state);
    io.emit("stateUpdate", state);
  });
});

server.listen(3000, () => {
  console.log("Serveur lancé sur http://localhost:3000");
});

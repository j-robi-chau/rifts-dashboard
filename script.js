const STORAGE_KEY = "rifts_dashboard_v1";

const defaultStats = () => ({
  ppe: 50,
  sdc: 30,
  mdc: 20,
  attacks: 4,
});

const state = loadState();

const addCharacterForm = document.querySelector("#add-character-form");
const newCharacterNameInput = document.querySelector("#new-character-name");
const partyList = document.querySelector("#party-list");
const emptyDetail = document.querySelector("#empty-detail");
const detailPanel = document.querySelector("#character-detail");
const detailNameInput = document.querySelector("#detail-name");
const deleteCharacterButton = document.querySelector("#delete-character");
const statsGrid = document.querySelector("#stats-grid");
const ammoList = document.querySelector("#ammo-list");
const addAmmoForm = document.querySelector("#add-ammo-form");
const ammoWeaponInput = document.querySelector("#ammo-weapon");
const ammoMaxInput = document.querySelector("#ammo-max");
const characterHistory = document.querySelector("#character-history");
const globalHistory = document.querySelector("#global-history");
const exportButton = document.querySelector("#export-data");
const importTriggerButton = document.querySelector("#import-trigger");
const importFileInput = document.querySelector("#import-file");
const resetDataButton = document.querySelector("#reset-data");

const logDialog = document.querySelector("#log-dialog");
const logDialogForm = document.querySelector("#log-dialog-form");
const logDialogContext = document.querySelector("#log-dialog-context");
const logReasonInput = document.querySelector("#log-reason");

const partyItemTemplate = document.querySelector("#party-item-template");
const statRowTemplate = document.querySelector("#stat-row-template");
const ammoItemTemplate = document.querySelector("#ammo-item-template");
const historyItemTemplate = document.querySelector("#history-item-template");

let pendingChange = null;

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function timestamp() {
  return new Date().toLocaleString();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function asInt(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isNaN(number) ? fallback : number;
}

function normalizeStatValue(value, fallback) {
  if (typeof value === "number") {
    return Math.max(0, asInt(value, fallback));
  }

  if (value && typeof value === "object") {
    return Math.max(0, asInt(value.current, fallback));
  }

  return Math.max(0, fallback);
}

function sanitizeForDisplay(stateToFix) {
  stateToFix.characters.forEach((character) => {
    const defaults = defaultStats();
    character.stats ||= defaults;

    character.stats = {
      ppe: normalizeStatValue(character.stats.ppe, defaults.ppe),
      sdc: normalizeStatValue(character.stats.sdc, defaults.sdc),
      mdc: normalizeStatValue(character.stats.mdc, defaults.mdc),
      attacks: normalizeStatValue(character.stats.attacks, defaults.attacks),
    };

    if (!Array.isArray(character.ammo)) {
      character.ammo = [];
    }

    character.ammo.forEach((entry) => {
      entry.max = Math.max(1, asInt(entry.max, 1));
      entry.current = clamp(asInt(entry.current, entry.max), 0, entry.max);
    });

    if (!Array.isArray(character.history)) {
      character.history = [];
    }
  });
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { characters: [], selectedCharacterId: null, history: [] };
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.characters) || !Array.isArray(parsed.history)) {
      throw new Error("Invalid state");
    }

    sanitizeForDisplay(parsed);
    return parsed;
  } catch {
    return { characters: [], selectedCharacterId: null, history: [] };
  }
}

function selectedCharacter() {
  return state.characters.find((character) => character.id === state.selectedCharacterId) || null;
}

function createCharacter(name) {
  return {
    id: uid(),
    name,
    stats: defaultStats(),
    ammo: [],
    history: [],
  };
}

function render() {
  renderPartyList();
  renderDetail();
  renderGlobalHistory();
}

function renderPartyList() {
  partyList.innerHTML = "";

  state.characters.forEach((character) => {
    const fragment = partyItemTemplate.content.cloneNode(true);
    const openButton = fragment.querySelector(".open-character");
    const meta = fragment.querySelector(".party-meta");

    openButton.textContent = character.name;
    openButton.addEventListener("click", () => {
      state.selectedCharacterId = character.id;
      saveState();
      render();
    });

    meta.textContent = `PPE ${character.stats.ppe} • SDC ${character.stats.sdc} • MDC ${character.stats.mdc}`;

    partyList.append(fragment);
  });
}

function renderDetail() {
  const character = selectedCharacter();
  if (!character) {
    emptyDetail.hidden = false;
    detailPanel.hidden = true;
    return;
  }

  emptyDetail.hidden = true;
  detailPanel.hidden = false;

  detailNameInput.value = character.name;
  renderStats(character);
  renderAmmo(character);
  renderCharacterHistory(character);
}

function queueStatChange({ character, statKey, label, delta, context }) {
  queueChange({
    context,
    apply: (reason) => {
      const before = character.stats[statKey];
      character.stats[statKey] = Math.max(0, before + delta);
      const appliedDelta = character.stats[statKey] - before;
      pushHistory(character, `${label} ${appliedDelta >= 0 ? "+" : ""}${appliedDelta} (${character.stats[statKey]})`, reason, appliedDelta);
    },
  });
}

function wireCustomAdjustment({ customAmountInput, onApply }) {
  const customButtons = customAmountInput
    .closest(".custom-controls")
    .querySelectorAll("button[data-custom-action]");

  customButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const amount = Math.max(1, asInt(customAmountInput.value, 1));
      customAmountInput.value = amount;
      const signedAmount = button.dataset.customAction === "subtract" ? -amount : amount;
      onApply(signedAmount);
    });
  });
}

function renderStats(character) {
  statsGrid.innerHTML = "";

  const config = [
    { key: "ppe", label: "PPE" },
    { key: "sdc", label: "SDC" },
    { key: "mdc", label: "MDC" },
    { key: "attacks", label: "Attacks per Melee" },
  ];

  config.forEach((entry) => {
    const fragment = statRowTemplate.content.cloneNode(true);
    const label = fragment.querySelector(".stat-label");
    const value = fragment.querySelector(".stat-value");
    const quickButtons = fragment.querySelectorAll(".quick-controls button[data-delta]");
    const customAmountInput = fragment.querySelector(".mod-input");

    label.textContent = entry.label;
    value.textContent = `${character.stats[entry.key]}`;

    quickButtons.forEach((button) => {
      const buttonDelta = asInt(button.dataset.delta, 0);
      if (entry.key === "attacks" && Math.abs(buttonDelta) === 5) {
        button.hidden = true;
        return;
      }

      button.addEventListener("click", () => {
        queueStatChange({
          character,
          statKey: entry.key,
          label: entry.label,
          delta: buttonDelta,
          context: `${character.name}: ${entry.label} ${buttonDelta >= 0 ? "+" : ""}${buttonDelta}`,
        });
      });
    });

    wireCustomAdjustment({
      customAmountInput,
      onApply: (delta) => {
        queueStatChange({
          character,
          statKey: entry.key,
          label: entry.label,
          delta,
          context: `${character.name}: ${entry.label} custom ${delta >= 0 ? "+" : ""}${delta}`,
        });
      },
    });

    statsGrid.append(fragment);
  });
}

function renderAmmo(character) {
  ammoList.innerHTML = "";

  character.ammo.forEach((ammo) => {
    const fragment = ammoItemTemplate.content.cloneNode(true);
    const weaponName = fragment.querySelector(".weapon-name");
    const weaponValue = fragment.querySelector(".weapon-value");
    const quickButtons = fragment.querySelectorAll(".quick-controls button[data-delta]");
    const reloadButton = fragment.querySelector(".reload");
    const removeButton = fragment.querySelector(".remove-ammo");
    const customAmountInput = fragment.querySelector(".mod-input");

    weaponName.textContent = ammo.weapon;
    weaponValue.textContent = `${ammo.current}/${ammo.max}`;

    quickButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const delta = asInt(button.dataset.delta, 0);
        queueChange({
          context: `${character.name}: ammo ${ammo.weapon} ${delta >= 0 ? "+" : ""}${delta}`,
          apply: (reason) => {
            const before = ammo.current;
            ammo.current = clamp(ammo.current + delta, 0, ammo.max);
            const appliedDelta = ammo.current - before;
            pushHistory(
              character,
              `Ammo (${ammo.weapon}) ${appliedDelta >= 0 ? "+" : ""}${appliedDelta} (${ammo.current}/${ammo.max})`,
              reason,
              appliedDelta
            );
          },
        });
      });
    });

    wireCustomAdjustment({
      customAmountInput,
      onApply: (delta) => {
        queueChange({
          context: `${character.name}: ammo ${ammo.weapon} custom ${delta >= 0 ? "+" : ""}${delta}`,
          apply: (reason) => {
            const before = ammo.current;
            ammo.current = clamp(ammo.current + delta, 0, ammo.max);
            const appliedDelta = ammo.current - before;
            pushHistory(
              character,
              `Ammo (${ammo.weapon}) ${appliedDelta >= 0 ? "+" : ""}${appliedDelta} (${ammo.current}/${ammo.max})`,
              reason,
              appliedDelta
            );
          },
        });
      },
    });

    reloadButton.addEventListener("click", () => {
      queueChange({
        context: `${character.name}: reload ${ammo.weapon}`,
        apply: (reason) => {
          const before = ammo.current;
          ammo.current = ammo.max;
          pushHistory(character, `Ammo (${ammo.weapon}) reloaded (${ammo.current}/${ammo.max})`, reason, ammo.current - before);
        },
      });
    });

    removeButton.addEventListener("click", () => {
      const confirmed = window.confirm(`Remove ammo tracker for ${ammo.weapon}?`);
      if (!confirmed) {
        return;
      }
      character.ammo = character.ammo.filter((entry) => entry.id !== ammo.id);
      pushHistory(character, `Removed ammo tracker: ${ammo.weapon}`, "System");
    });

    ammoList.append(fragment);
  });
}

function renderCharacterHistory(character) {
  characterHistory.innerHTML = "";

  character.history.slice(0, 50).forEach((entry) => {
    const fragment = historyItemTemplate.content.cloneNode(true);
    fragment.querySelector(".history-line").textContent = `[${entry.time}] ${entry.text} — ${entry.reason}`;
    characterHistory.append(fragment);
  });
}

function renderGlobalHistory() {
  globalHistory.innerHTML = "";

  state.history.slice(0, 100).forEach((entry) => {
    const fragment = historyItemTemplate.content.cloneNode(true);
    fragment.querySelector(".history-line").textContent = `[${entry.time}] ${entry.character}: ${entry.text} — ${entry.reason}`;
    globalHistory.append(fragment);
  });
}

function pushHistory(character, text, reason, delta = null) {
  const entry = {
    id: uid(),
    character: character.name,
    text,
    reason: reason || "No reason provided",
    delta,
    time: timestamp(),
  };

  character.history.unshift(entry);
  state.history.unshift(entry);
  saveState();
  render();
}

function queueChange(change) {
  pendingChange = change;
  logDialogContext.textContent = change.context;
  logReasonInput.value = "";
  logDialog.showModal();
  logReasonInput.focus();
}

addCharacterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = newCharacterNameInput.value.trim();
  if (!name) {
    return;
  }

  const character = createCharacter(name);
  state.characters.push(character);
  state.selectedCharacterId = character.id;
  saveState();
  render();
  addCharacterForm.reset();
});

detailNameInput.addEventListener("change", () => {
  const character = selectedCharacter();
  if (!character) {
    return;
  }

  const nextName = detailNameInput.value.trim();
  if (!nextName) {
    detailNameInput.value = character.name;
    return;
  }

  character.name = nextName;
  saveState();
  render();
});

deleteCharacterButton.addEventListener("click", () => {
  const character = selectedCharacter();
  if (!character) {
    return;
  }

  const confirmed = window.confirm(`Delete ${character.name}? This cannot be undone.`);
  if (!confirmed) {
    return;
  }

  state.characters = state.characters.filter((entry) => entry.id !== character.id);
  if (state.selectedCharacterId === character.id) {
    state.selectedCharacterId = state.characters[0]?.id || null;
  }
  saveState();
  render();
});

addAmmoForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const character = selectedCharacter();
  if (!character) {
    return;
  }

  const weapon = ammoWeaponInput.value.trim();
  const max = Math.max(1, asInt(ammoMaxInput.value, 1));
  if (!weapon) {
    return;
  }

  character.ammo.push({ id: uid(), weapon, current: max, max });
  pushHistory(character, `Added ammo tracker: ${weapon} (${max}/${max})`, "System");
  addAmmoForm.reset();
  ammoMaxInput.value = "20";
});

logDialogForm.addEventListener("submit", (event) => {
  const submitButton = event.submitter;
  if (!submitButton || submitButton.value !== "confirm") {
    pendingChange = null;
    return;
  }

  event.preventDefault();
  if (!pendingChange) {
    logDialog.close();
    return;
  }

  const reason = logReasonInput.value.trim();
  if (!reason) {
    logReasonInput.focus();
    return;
  }

  pendingChange.apply(reason);
  pendingChange = null;
  logDialog.close();
});

exportButton.addEventListener("click", () => {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `rifts-dashboard-export-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

importTriggerButton.addEventListener("click", () => {
  importFileInput.click();
});

importFileInput.addEventListener("change", async () => {
  const file = importFileInput.files?.[0];
  if (!file) {
    return;
  }

  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    window.alert("Invalid JSON file.");
    return;
  }

  const confirmed = window.confirm("Importing will overwrite current dashboard data. Continue?");
  if (!confirmed) {
    return;
  }

  if (!Array.isArray(parsed.characters) || !Array.isArray(parsed.history)) {
    window.alert("JSON does not match expected dashboard export format.");
    return;
  }

  sanitizeForDisplay(parsed);
  state.characters = parsed.characters;
  state.selectedCharacterId = parsed.selectedCharacterId || parsed.characters[0]?.id || null;
  state.history = parsed.history;
  saveState();
  render();
  importFileInput.value = "";
});

resetDataButton.addEventListener("click", () => {
  const firstConfirm = window.confirm("This will erase all saved dashboard data. Continue?");
  if (!firstConfirm) {
    return;
  }

  const typed = window.prompt('Type RESET to permanently clear all data.');
  if (typed !== "RESET") {
    return;
  }

  state.characters = [];
  state.selectedCharacterId = null;
  state.history = [];
  saveState();
  render();
});

if (!state.selectedCharacterId && state.characters.length > 0) {
  state.selectedCharacterId = state.characters[0].id;
}

saveState();
render();

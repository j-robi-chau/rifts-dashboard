const STORAGE_KEY = "rifts_dashboard_v1";
const SAVE_FLASH_MS = 1600;
const CORE_STAT_ORDER = ["hp", "ppe", "sdc", "mdc", "attacks"];
const BANK_CURRENCIES = ["credits", "gold", "emeralds", "sapphires", "diamonds", "rubies"];
const DEFAULT_HISTORY_FILTERS = { character: "all", stat: "all" };

const defaultStats = () => ({
  hp: 0,
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
const undoLastActionButton = document.querySelector("#undo-last-action");
const duplicateCharacterButton = document.querySelector("#duplicate-character");
const editBaseStatsButton = document.querySelector("#edit-base-stats");
const addStatBlockButton = document.querySelector("#add-stat-block");
const deleteCharacterButton = document.querySelector("#delete-character");
const statsGrid = document.querySelector("#stats-grid");
const characterNotes = document.querySelector("#character-notes");
const sessionNotes = document.querySelector("#session-notes");
const clearSessionNotesButton = document.querySelector("#clear-session-notes");
const ammoList = document.querySelector("#ammo-list");
const addAmmoForm = document.querySelector("#add-ammo-form");
const ammoWeaponInput = document.querySelector("#ammo-weapon");
const ammoMaxInput = document.querySelector("#ammo-max");
const characterHistory = document.querySelector("#character-history");
const globalHistory = document.querySelector("#global-history");
const historyCharacterFilter = document.querySelector("#history-character-filter");
const historyStatFilter = document.querySelector("#history-stat-filter");
const exportButton = document.querySelector("#export-data");
const importTriggerButton = document.querySelector("#import-trigger");
const importFileInput = document.querySelector("#import-file");
const resetDataButton = document.querySelector("#reset-data");
const saveIndicator = document.querySelector("#save-indicator");

const logDialog = document.querySelector("#log-dialog");
const logDialogForm = document.querySelector("#log-dialog-form");
const logDialogContext = document.querySelector("#log-dialog-context");
const logReasonInput = document.querySelector("#log-reason");

const baseStatsDialog = document.querySelector("#base-stats-dialog");
const baseStatsForm = document.querySelector("#base-stats-form");
const baseHpInput = document.querySelector("#base-hp");
const basePpeInput = document.querySelector("#base-ppe");
const baseSdcInput = document.querySelector("#base-sdc");
const baseMdcInput = document.querySelector("#base-mdc");
const baseAttacksInput = document.querySelector("#base-attacks");
const applyBaseToCurrentInput = document.querySelector("#apply-base-to-current");

const partyItemTemplate = document.querySelector("#party-item-template");
const statRowTemplate = document.querySelector("#stat-row-template");
const ammoItemTemplate = document.querySelector("#ammo-item-template");
const historyItemTemplate = document.querySelector("#history-item-template");

let pendingChange = null;
let saveFlashTimer = null;

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

function createDefaultBankValues(source = {}) {
  return BANK_CURRENCIES.reduce((acc, currency) => {
    acc[currency] = Math.max(0, asInt(source[currency], 0));
    return acc;
  }, {});
}

function buildBaseStats(character, defaults) {
  const currentStats = character.stats || defaults;
  const existingBase = character.baseStats || {};

  return {
    hp: normalizeStatValue(existingBase.hp, normalizeStatValue(currentStats.hp, defaults.hp)),
    ppe: normalizeStatValue(existingBase.ppe, normalizeStatValue(currentStats.ppe, defaults.ppe)),
    sdc: normalizeStatValue(existingBase.sdc, normalizeStatValue(currentStats.sdc, defaults.sdc)),
    mdc: normalizeStatValue(existingBase.mdc, normalizeStatValue(currentStats.mdc, defaults.mdc)),
    attacks: normalizeStatValue(existingBase.attacks, normalizeStatValue(currentStats.attacks, defaults.attacks)),
  };
}

function normalizeCustomStat(entry, index) {
  const type = (entry.type || "custom").toString().trim().toLowerCase();
  const id = entry.id || uid();
  const label = (entry.label || entry.title || (type === "bank" ? "Bank" : `Custom ${index + 1}`)).toString().trim() || `Custom ${index + 1}`;
  const pinned = entry.pinned === true;

  if (type === "bank") {
    return {
      id,
      type: "bank",
      label,
      pinned,
      values: createDefaultBankValues(entry.values || entry.current || {}),
    };
  }

  const base = normalizeStatValue(entry.base, normalizeStatValue(entry.current, 0));
  return {
    id,
    type: "custom",
    label,
    pinned,
    base,
    current: normalizeStatValue(entry.current, base),
  };
}

function coreStatIds() {
  return CORE_STAT_ORDER.map((key) => `core:${key}`);
}

function ensureStatOrder(character) {
  const existing = Array.isArray(character.statOrder) ? character.statOrder.filter((id) => typeof id === "string") : [];
  const customIds = character.customStats.map((entry) => `custom:${entry.id}`);
  const available = [...coreStatIds(), ...customIds];
  const unique = [];

  existing.forEach((id) => {
    if (available.includes(id) && !unique.includes(id)) {
      unique.push(id);
    }
  });

  available.forEach((id) => {
    if (!unique.includes(id)) {
      unique.push(id);
    }
  });

  character.statOrder = unique;
}

function sanitizeHistoryEntry(entry) {
  entry.id ||= uid();
  entry.character ||= "Unknown";
  entry.reason = typeof entry.reason === "string" && entry.reason.trim() ? entry.reason.trim() : "No reason provided";
  entry.text ||= "Updated";
  entry.time ||= timestamp();
  entry.statType = typeof entry.statType === "string" ? entry.statType : "other";
  if (entry.undo && typeof entry.undo === "object") {
    entry.undo = entry.undo;
  } else {
    delete entry.undo;
  }
}

function sanitizeForDisplay(stateToFix) {
  stateToFix.characters.forEach((character) => {
    const defaults = defaultStats();
    character.id ||= uid();
    character.name = typeof character.name === "string" && character.name.trim() ? character.name : "Unnamed";
    character.stats ||= defaults;

    character.stats = {
      hp: normalizeStatValue(character.stats.hp, defaults.hp),
      ppe: normalizeStatValue(character.stats.ppe, defaults.ppe),
      sdc: normalizeStatValue(character.stats.sdc, defaults.sdc),
      mdc: normalizeStatValue(character.stats.mdc, defaults.mdc),
      attacks: normalizeStatValue(character.stats.attacks, defaults.attacks),
    };

    character.baseStats = buildBaseStats(character, defaults);
    character.notes = typeof character.notes === "string" ? character.notes : "";
    character.sessionNotes = typeof character.sessionNotes === "string" ? character.sessionNotes : "";
    character.historyFilters = {
      character: character.historyFilters?.character || DEFAULT_HISTORY_FILTERS.character,
      stat: character.historyFilters?.stat || DEFAULT_HISTORY_FILTERS.stat,
    };

    if (!Array.isArray(character.customStats)) {
      character.customStats = [];
    }
    character.customStats = character.customStats.map(normalizeCustomStat);

    if (!Array.isArray(character.ammo)) {
      character.ammo = [];
    }

    character.ammo.forEach((entry) => {
      entry.id ||= uid();
      entry.weapon = (entry.weapon || "Weapon").toString();
      entry.max = Math.max(1, asInt(entry.max, 1));
      entry.current = clamp(asInt(entry.current, entry.max), 0, entry.max);
    });

    if (!Array.isArray(character.history)) {
      character.history = [];
    }
    character.history.forEach(sanitizeHistoryEntry);

    ensureStatOrder(character);
  });

  if (!Array.isArray(stateToFix.history)) {
    stateToFix.history = [];
  }
  stateToFix.history.forEach(sanitizeHistoryEntry);

  stateToFix.historyFilters = {
    character: stateToFix.historyFilters?.character || DEFAULT_HISTORY_FILTERS.character,
    stat: stateToFix.historyFilters?.stat || DEFAULT_HISTORY_FILTERS.stat,
  };
}

function flashSaved() {
  saveIndicator.textContent = `Saved ${new Date().toLocaleTimeString()}`;
  saveIndicator.classList.add("is-visible");
  window.clearTimeout(saveFlashTimer);
  saveFlashTimer = window.setTimeout(() => {
    saveIndicator.classList.remove("is-visible");
  }, SAVE_FLASH_MS);
}

function saveState(shouldFlash = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (shouldFlash) {
    flashSaved();
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { characters: [], selectedCharacterId: null, history: [], historyFilters: { ...DEFAULT_HISTORY_FILTERS } };
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.characters) || !Array.isArray(parsed.history)) {
      throw new Error("Invalid state");
    }

    sanitizeForDisplay(parsed);
    return parsed;
  } catch {
    return { characters: [], selectedCharacterId: null, history: [], historyFilters: { ...DEFAULT_HISTORY_FILTERS } };
  }
}

function selectedCharacter() {
  return state.characters.find((character) => character.id === state.selectedCharacterId) || null;
}

function createCharacter(name, baseStats) {
  return {
    id: uid(),
    name,
    stats: { ...baseStats },
    baseStats: { ...baseStats },
    notes: "",
    sessionNotes: "",
    ammo: [],
    customStats: [],
    statOrder: coreStatIds(),
    history: [],
  };
}

function duplicateCharacter(sourceCharacter) {
  const duplicate = JSON.parse(JSON.stringify(sourceCharacter));
  duplicate.id = uid();
  duplicate.name = `${sourceCharacter.name} Copy`;
  duplicate.ammo = duplicate.ammo.map((entry) => ({ ...entry, id: uid() }));
  duplicate.customStats = duplicate.customStats.map((entry) => ({ ...entry, id: uid() }));
  duplicate.statOrder = [];
  duplicate.history = [];
  ensureStatOrder(duplicate);
  return duplicate;
}

function getCoreStatLabel(key) {
  const labels = {
    hp: "HP",
    ppe: "PPE",
    sdc: "SDC",
    mdc: "MDC",
    attacks: "Attacks per Melee",
  };
  return labels[key] || key.toUpperCase();
}

function getCoreStatSummary(character) {
  return `HP ${character.stats.hp} • SDC ${character.stats.sdc} • MDC ${character.stats.mdc} • PPE ${character.stats.ppe}`;
}

function getStatTypeOptions() {
  const base = [
    { value: "all", label: "All stats" },
    { value: "hp", label: "HP" },
    { value: "ppe", label: "PPE" },
    { value: "sdc", label: "SDC" },
    { value: "mdc", label: "MDC" },
    { value: "attacks", label: "Attacks" },
    { value: "bank", label: "Bank" },
    { value: "ammo", label: "Ammo" },
  ];

  const customLabels = [];
  state.characters.forEach((character) => {
    character.customStats.forEach((entry) => {
      if (entry.type === "custom" && !customLabels.some((item) => item.value === `custom:${entry.label}`)) {
        customLabels.push({ value: `custom:${entry.label}`, label: entry.label });
      }
    });
  });

  return [...base, ...customLabels];
}

function populateHistoryFilters() {
  const currentCharacter = state.historyFilters.character;
  const currentStat = state.historyFilters.stat;

  historyCharacterFilter.innerHTML = "";
  historyStatFilter.innerHTML = "";

  [{ value: "all", label: "All characters" }, ...state.characters.map((character) => ({ value: character.id, label: character.name }))].forEach((optionData) => {
    const option = document.createElement("option");
    option.value = optionData.value;
    option.textContent = optionData.label;
    historyCharacterFilter.append(option);
  });

  getStatTypeOptions().forEach((optionData) => {
    const option = document.createElement("option");
    option.value = optionData.value;
    option.textContent = optionData.label;
    historyStatFilter.append(option);
  });

  historyCharacterFilter.value = [...historyCharacterFilter.options].some((option) => option.value === currentCharacter)
    ? currentCharacter
    : "all";
  historyStatFilter.value = [...historyStatFilter.options].some((option) => option.value === currentStat)
    ? currentStat
    : "all";
}

function render() {
  populateHistoryFilters();
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
      saveState(false);
      render();
    });

    meta.textContent = getCoreStatSummary(character);
    partyList.append(fragment);
  });
}

function buildOrderedStatBlocks(character) {
  const blocks = character.statOrder
    .map((id) => {
      if (id.startsWith("core:")) {
        const key = id.slice(5);
        return {
          id,
          orderId: id,
          pinned: false,
          type: "core",
          statKey: key,
          label: getCoreStatLabel(key),
        };
      }

      const customId = id.slice(7);
      const customStat = character.customStats.find((entry) => entry.id === customId);
      if (!customStat) {
        return null;
      }

      return {
        id,
        orderId: id,
        pinned: customStat.pinned === true,
        type: customStat.type,
        customStat,
        label: customStat.label,
      };
    })
    .filter(Boolean);

  return blocks.sort((a, b) => Number(b.pinned) - Number(a.pinned));
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
  characterNotes.value = character.notes;
  sessionNotes.value = character.sessionNotes;
  undoLastActionButton.disabled = !getLastUndoableEntry(character);
  renderStats(character);
  renderAmmo(character);
  renderCharacterHistory(character);
}

function getLastUndoableEntry(character) {
  return character.history.find((entry) => entry.undo && !entry.undoneAt) || null;
}

function recordHistory(character, entry) {
  const historyEntry = {
    id: uid(),
    character: character.name,
    time: timestamp(),
    reason: entry.reason || "No reason provided",
    text: entry.text,
    delta: entry.delta ?? null,
    statType: entry.statType || "other",
    undo: entry.undo,
  };

  character.history.unshift(historyEntry);
  state.history.unshift(historyEntry);
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

function moveStatBlock(character, orderId, direction) {
  const index = character.statOrder.indexOf(orderId);
  if (index === -1) {
    return;
  }

  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= character.statOrder.length) {
    return;
  }

  const [entry] = character.statOrder.splice(index, 1);
  character.statOrder.splice(targetIndex, 0, entry);
  saveState();
  renderStats(character);
}

function deleteCustomStat(character, customStat) {
  const confirmed = window.confirm(`Delete stat block "${customStat.label}"?`);
  if (!confirmed) {
    return;
  }

  character.customStats = character.customStats.filter((entry) => entry.id !== customStat.id);
  character.statOrder = character.statOrder.filter((id) => id !== `custom:${customStat.id}`);
  recordHistory(character, {
    text: `Deleted stat block: ${customStat.label}`,
    statType: customStat.type === "bank" ? "bank" : `custom:${customStat.label}`,
    reason: "System",
  });
}

function applyStatChange(character, statKey, label, delta, reason) {
  const before = character.stats[statKey];
  character.stats[statKey] = Math.max(0, before + delta);
  const appliedDelta = character.stats[statKey] - before;
  recordHistory(character, {
    text: `${label} ${appliedDelta >= 0 ? "+" : ""}${appliedDelta} (${character.stats[statKey]})`,
    delta: appliedDelta,
    statType: statKey,
    reason,
    undo: {
      kind: "core-stat",
      statKey,
      previousValue: before,
      nextValue: character.stats[statKey],
    },
  });
}

function resetStatToBase(character, statKey, label) {
  const before = character.stats[statKey];
  const next = character.baseStats[statKey];
  character.stats[statKey] = next;
  recordHistory(character, {
    text: `${label} reset to base (${next})`,
    delta: next - before,
    statType: statKey,
    reason: "Reset to base",
    undo: {
      kind: "core-stat",
      statKey,
      previousValue: before,
      nextValue: next,
    },
  });
}

function applyCustomStatChange(character, customStat, delta, reason) {
  const before = customStat.current;
  customStat.current = Math.max(0, before + delta);
  const appliedDelta = customStat.current - before;
  recordHistory(character, {
    text: `${customStat.label} ${appliedDelta >= 0 ? "+" : ""}${appliedDelta} (${customStat.current})`,
    delta: appliedDelta,
    statType: `custom:${customStat.label}`,
    reason,
    undo: {
      kind: "custom-stat",
      statId: customStat.id,
      previousValue: before,
      nextValue: customStat.current,
    },
  });
}

function resetCustomStat(character, customStat) {
  const before = customStat.current;
  customStat.current = customStat.base;
  recordHistory(character, {
    text: `${customStat.label} reset to base (${customStat.current})`,
    delta: customStat.current - before,
    statType: `custom:${customStat.label}`,
    reason: "Reset to base",
    undo: {
      kind: "custom-stat",
      statId: customStat.id,
      previousValue: before,
      nextValue: customStat.current,
    },
  });
}

function applyBankChange(character, bankStat, currency, delta, reason) {
  const before = bankStat.values[currency];
  bankStat.values[currency] = Math.max(0, before + delta);
  const appliedDelta = bankStat.values[currency] - before;
  recordHistory(character, {
    text: `${bankStat.label}: ${currency} ${appliedDelta >= 0 ? "+" : ""}${appliedDelta} (${bankStat.values[currency]})`,
    delta: appliedDelta,
    statType: "bank",
    reason,
    undo: {
      kind: "bank",
      statId: bankStat.id,
      currency,
      previousValue: before,
      nextValue: bankStat.values[currency],
    },
  });
}

function wireCustomAdjustment({ customAmountInput, onApply }) {
  const customButtons = customAmountInput.closest(".custom-controls").querySelectorAll("button[data-custom-action]");

  customButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const amount = Math.max(1, asInt(customAmountInput.value, 1));
      customAmountInput.value = amount;
      const signedAmount = button.dataset.customAction === "subtract" ? -amount : amount;
      onApply(signedAmount);
    });
  });
}

function buildBankControls(character, bankStat, bankGrid) {
  BANK_CURRENCIES.forEach((currency) => {
    const wrapper = document.createElement("section");
    wrapper.className = "bank-currency";

    const title = document.createElement("strong");
    title.textContent = currency.charAt(0).toUpperCase() + currency.slice(1);

    const value = document.createElement("span");
    value.className = "bank-value";
    value.textContent = `${bankStat.values[currency]}`;

    const controls = document.createElement("div");
    controls.className = "bank-controls";

    [-10, -1, 1, 10].forEach((delta) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = delta < 0 ? "secondary" : "";
      button.textContent = `${delta > 0 ? "+" : ""}${delta}`;
      button.addEventListener("click", () => {
        queueChange({
          context: `${character.name}: ${bankStat.label} ${currency} ${delta > 0 ? "+" : ""}${delta}`,
          apply: (reason) => {
            applyBankChange(character, bankStat, currency, delta, reason);
          },
        });
      });
      controls.append(button);
    });

    wrapper.append(title, value, controls);
    bankGrid.append(wrapper);
  });
}

function renderStats(character) {
  statsGrid.innerHTML = "";
  const orderedBlocks = buildOrderedStatBlocks(character);

  orderedBlocks.forEach((block, visualIndex) => {
    const fragment = statRowTemplate.content.cloneNode(true);
    const label = fragment.querySelector(".stat-label");
    const headerValue = fragment.querySelector(".stat-header-value");
    const value = fragment.querySelector(".stat-value");
    const defaultBody = fragment.querySelector(".default-stat-body");
    const bankBody = fragment.querySelector(".bank-stat-body");
    const bankGrid = fragment.querySelector(".bank-grid");
    const quickButtons = fragment.querySelectorAll(".quick-controls button[data-delta]");
    const resetButton = fragment.querySelector(".reset-to-base");
    const customAmountInput = fragment.querySelector(".mod-input");
    const pinButton = fragment.querySelector(".pin-stat");
    const moveUpButton = fragment.querySelector(".move-stat-up");
    const moveDownButton = fragment.querySelector(".move-stat-down");
    const deleteButton = fragment.querySelector(".delete-stat-block");

    label.textContent = block.label;
    pinButton.textContent = block.pinned ? "★" : "☆";
    pinButton.title = block.pinned ? "Unpin stat" : "Pin stat";
    pinButton.disabled = block.type === "core";

    moveUpButton.disabled = visualIndex === 0;
    moveDownButton.disabled = visualIndex === orderedBlocks.length - 1;
    moveUpButton.addEventListener("click", () => moveStatBlock(character, block.orderId, -1));
    moveDownButton.addEventListener("click", () => moveStatBlock(character, block.orderId, 1));

    pinButton.addEventListener("click", () => {
      if (!block.customStat) {
        return;
      }
      block.customStat.pinned = !block.customStat.pinned;
      saveState();
      renderStats(character);
    });

    if (block.type === "core") {
      const statKey = block.statKey;
      const statLabel = getCoreStatLabel(statKey);
      headerValue.textContent = `${character.stats[statKey]}`;
      value.textContent = `${character.stats[statKey]} (Base ${character.baseStats[statKey]})`;
      deleteButton.hidden = true;

      quickButtons.forEach((button) => {
        const buttonDelta = asInt(button.dataset.delta, 0);
        if (statKey === "attacks" && Math.abs(buttonDelta) === 5) {
          button.hidden = true;
          return;
        }

        button.addEventListener("click", () => {
          queueChange({
            context: `${character.name}: ${statLabel} ${buttonDelta >= 0 ? "+" : ""}${buttonDelta}`,
            apply: (reason) => {
              applyStatChange(character, statKey, statLabel, buttonDelta, reason);
            },
          });
        });
      });

      resetButton.addEventListener("click", () => {
        resetStatToBase(character, statKey, statLabel);
      });

      wireCustomAdjustment({
        customAmountInput,
        onApply: (delta) => {
          queueChange({
            context: `${character.name}: ${statLabel} custom ${delta >= 0 ? "+" : ""}${delta}`,
            apply: (reason) => {
              applyStatChange(character, statKey, statLabel, delta, reason);
            },
          });
        },
      });
    } else if (block.type === "bank") {
      defaultBody.hidden = true;
      bankBody.hidden = false;
      headerValue.textContent = "Currencies";
      deleteButton.hidden = false;
      deleteButton.addEventListener("click", () => {
        deleteCustomStat(character, block.customStat);
      });
      buildBankControls(character, block.customStat, bankGrid);
    } else {
      headerValue.textContent = `${block.customStat.current}`;
      value.textContent = `${block.customStat.current} (Base ${block.customStat.base})`;
      deleteButton.hidden = false;
      deleteButton.addEventListener("click", () => {
        deleteCustomStat(character, block.customStat);
      });

      quickButtons.forEach((button) => {
        const buttonDelta = asInt(button.dataset.delta, 0);
        button.addEventListener("click", () => {
          queueChange({
            context: `${character.name}: ${block.customStat.label} ${buttonDelta >= 0 ? "+" : ""}${buttonDelta}`,
            apply: (reason) => {
              applyCustomStatChange(character, block.customStat, buttonDelta, reason);
            },
          });
        });
      });

      resetButton.addEventListener("click", () => {
        resetCustomStat(character, block.customStat);
      });

      wireCustomAdjustment({
        customAmountInput,
        onApply: (delta) => {
          queueChange({
            context: `${character.name}: ${block.customStat.label} custom ${delta >= 0 ? "+" : ""}${delta}`,
            apply: (reason) => {
              applyCustomStatChange(character, block.customStat, delta, reason);
            },
          });
        },
      });
    }

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
            recordHistory(character, {
              text: `Ammo (${ammo.weapon}) ${appliedDelta >= 0 ? "+" : ""}${appliedDelta} (${ammo.current}/${ammo.max})`,
              delta: appliedDelta,
              statType: "ammo",
              reason,
            });
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
            recordHistory(character, {
              text: `Ammo (${ammo.weapon}) ${appliedDelta >= 0 ? "+" : ""}${appliedDelta} (${ammo.current}/${ammo.max})`,
              delta: appliedDelta,
              statType: "ammo",
              reason,
            });
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
          recordHistory(character, {
            text: `Ammo (${ammo.weapon}) reloaded (${ammo.current}/${ammo.max})`,
            delta: ammo.current - before,
            statType: "ammo",
            reason,
          });
        },
      });
    });

    removeButton.addEventListener("click", () => {
      const confirmed = window.confirm(`Remove ammo tracker for ${ammo.weapon}?`);
      if (!confirmed) {
        return;
      }
      character.ammo = character.ammo.filter((entry) => entry.id !== ammo.id);
      recordHistory(character, {
        text: `Removed ammo tracker: ${ammo.weapon}`,
        statType: "ammo",
        reason: "System",
      });
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

  state.history
    .filter((entry) => {
      const matchesCharacter = state.historyFilters.character === "all" || state.characters.find((character) => character.id === state.historyFilters.character)?.name === entry.character;
      const matchesStat = state.historyFilters.stat === "all" || entry.statType === state.historyFilters.stat;
      return matchesCharacter && matchesStat;
    })
    .slice(0, 100)
    .forEach((entry) => {
      const fragment = historyItemTemplate.content.cloneNode(true);
      fragment.querySelector(".history-line").textContent = `[${entry.time}] ${entry.character}: ${entry.text} — ${entry.reason}`;
      globalHistory.append(fragment);
    });
}

function promptForBaseStats(seed = defaultStats()) {
  const hp = window.prompt("Base HP", `${seed.hp}`);
  if (hp === null) return null;

  const ppe = window.prompt("Base PPE", `${seed.ppe}`);
  if (ppe === null) return null;

  const sdc = window.prompt("Base SDC", `${seed.sdc}`);
  if (sdc === null) return null;

  const mdc = window.prompt("Base MDC", `${seed.mdc}`);
  if (mdc === null) return null;

  const attacks = window.prompt("Base Attacks per melee", `${seed.attacks}`);
  if (attacks === null) return null;

  return {
    hp: Math.max(0, asInt(hp, seed.hp)),
    ppe: Math.max(0, asInt(ppe, seed.ppe)),
    sdc: Math.max(0, asInt(sdc, seed.sdc)),
    mdc: Math.max(0, asInt(mdc, seed.mdc)),
    attacks: Math.max(0, asInt(attacks, seed.attacks)),
  };
}

function runUndo(character) {
  const entry = getLastUndoableEntry(character);
  if (!entry) {
    return;
  }

  if (entry.undo.kind === "core-stat") {
    character.stats[entry.undo.statKey] = entry.undo.previousValue;
  } else if (entry.undo.kind === "custom-stat") {
    const customStat = character.customStats.find((item) => item.id === entry.undo.statId);
    if (!customStat) {
      return;
    }
    customStat.current = entry.undo.previousValue;
  } else if (entry.undo.kind === "bank") {
    const bankStat = character.customStats.find((item) => item.id === entry.undo.statId && item.type === "bank");
    if (!bankStat) {
      return;
    }
    bankStat.values[entry.undo.currency] = entry.undo.previousValue;
  } else {
    return;
  }

  entry.undoneAt = timestamp();
  recordHistory(character, {
    text: `Undid: ${entry.text}`,
    statType: entry.statType,
    reason: "Undo",
  });
}

addCharacterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = newCharacterNameInput.value.trim();
  if (!name) {
    return;
  }

  const baseStats = promptForBaseStats();
  if (!baseStats) {
    return;
  }

  const character = createCharacter(name, baseStats);
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

  const previousName = character.name;
  character.name = nextName;
  character.history.forEach((entry) => {
    if (entry.character === previousName) {
      entry.character = nextName;
    }
  });
  state.history.forEach((entry) => {
    if (entry.character === previousName) {
      entry.character = nextName;
    }
  });
  saveState();
  render();
});

characterNotes.addEventListener("input", () => {
  const character = selectedCharacter();
  if (!character) {
    return;
  }

  character.notes = characterNotes.value;
  saveState();
});

sessionNotes.addEventListener("input", () => {
  const character = selectedCharacter();
  if (!character) {
    return;
  }

  character.sessionNotes = sessionNotes.value;
  saveState();
});

clearSessionNotesButton.addEventListener("click", () => {
  const character = selectedCharacter();
  if (!character || !character.sessionNotes) {
    return;
  }

  const confirmed = window.confirm("Clear session notes for this character?");
  if (!confirmed) {
    return;
  }

  character.sessionNotes = "";
  saveState();
  renderDetail();
});

undoLastActionButton.addEventListener("click", () => {
  const character = selectedCharacter();
  if (!character) {
    return;
  }

  runUndo(character);
});

duplicateCharacterButton.addEventListener("click", () => {
  const character = selectedCharacter();
  if (!character) {
    return;
  }

  const duplicate = duplicateCharacter(character);
  state.characters.push(duplicate);
  state.selectedCharacterId = duplicate.id;
  saveState();
  render();
});

editBaseStatsButton.addEventListener("click", () => {
  const character = selectedCharacter();
  if (!character) {
    return;
  }

  baseHpInput.value = character.baseStats.hp;
  basePpeInput.value = character.baseStats.ppe;
  baseSdcInput.value = character.baseStats.sdc;
  baseMdcInput.value = character.baseStats.mdc;
  baseAttacksInput.value = character.baseStats.attacks;
  applyBaseToCurrentInput.checked = false;
  baseStatsDialog.showModal();
});

addStatBlockButton.addEventListener("click", () => {
  const character = selectedCharacter();
  if (!character) {
    return;
  }

  const typeInput = window.prompt("Stat type (Custom or Bank)", "Custom");
  if (typeInput === null) {
    return;
  }

  const normalizedType = typeInput.trim().toLowerCase();
  const isBank = normalizedType === "bank";
  const label = window.prompt("Stat title/label", isBank ? "Bank" : "Custom Stat");
  if (label === null) {
    return;
  }

  const cleanLabel = label.trim();
  if (!cleanLabel) {
    window.alert("Stat title/label is required.");
    return;
  }

  const newStat = isBank
    ? {
        id: uid(),
        type: "bank",
        label: cleanLabel,
        pinned: false,
        values: createDefaultBankValues(),
      }
    : {
        id: uid(),
        type: "custom",
        label: cleanLabel,
        pinned: false,
        base: Math.max(0, asInt(window.prompt("Base value", "0"), 0)),
        current: 0,
      };

  if (!isBank) {
    newStat.current = newStat.base;
  }

  character.customStats.push(newStat);
  character.statOrder.push(`custom:${newStat.id}`);
  saveState();
  render();
});

baseStatsForm.addEventListener("submit", (event) => {
  const submitButton = event.submitter;
  if (!submitButton || submitButton.value !== "confirm") {
    return;
  }

  event.preventDefault();
  const character = selectedCharacter();
  if (!character) {
    baseStatsDialog.close();
    return;
  }

  const nextBase = {
    hp: Math.max(0, asInt(baseHpInput.value, character.baseStats.hp)),
    ppe: Math.max(0, asInt(basePpeInput.value, character.baseStats.ppe)),
    sdc: Math.max(0, asInt(baseSdcInput.value, character.baseStats.sdc)),
    mdc: Math.max(0, asInt(baseMdcInput.value, character.baseStats.mdc)),
    attacks: Math.max(0, asInt(baseAttacksInput.value, character.baseStats.attacks)),
  };

  character.baseStats = nextBase;

  if (applyBaseToCurrentInput.checked) {
    character.stats = { ...character.stats, ...nextBase };
  }

  saveState();
  render();
  baseStatsDialog.close();
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
  recordHistory(character, {
    text: `Added ammo tracker: ${weapon} (${max}/${max})`,
    statType: "ammo",
    reason: "System",
  });
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

  const wantsBackup = window.confirm("Importing will overwrite current dashboard data. Export a backup first?");
  if (wantsBackup) {
    exportButton.click();
  }

  const confirmed = window.confirm("Continue with import and overwrite current dashboard data?");
  if (!confirmed) {
    importFileInput.value = "";
    return;
  }

  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    window.alert("Invalid JSON file.");
    importFileInput.value = "";
    return;
  }

  if (!Array.isArray(parsed.characters) || !Array.isArray(parsed.history)) {
    window.alert("JSON does not match expected dashboard export format.");
    importFileInput.value = "";
    return;
  }

  sanitizeForDisplay(parsed);
  state.characters = parsed.characters;
  state.selectedCharacterId = parsed.selectedCharacterId || parsed.characters[0]?.id || null;
  state.history = parsed.history;
  state.historyFilters = parsed.historyFilters || { ...DEFAULT_HISTORY_FILTERS };
  saveState();
  render();
  importFileInput.value = "";
});

resetDataButton.addEventListener("click", () => {
  const typed = window.prompt('Type RESET to permanently clear all data.');
  if (typed !== "RESET") {
    return;
  }

  state.characters = [];
  state.selectedCharacterId = null;
  state.history = [];
  state.historyFilters = { ...DEFAULT_HISTORY_FILTERS };
  saveState();
  render();
});

historyCharacterFilter.addEventListener("change", () => {
  state.historyFilters.character = historyCharacterFilter.value;
  saveState(false);
  renderGlobalHistory();
});

historyStatFilter.addEventListener("change", () => {
  state.historyFilters.stat = historyStatFilter.value;
  saveState(false);
  renderGlobalHistory();
});

if (!state.selectedCharacterId && state.characters.length > 0) {
  state.selectedCharacterId = state.characters[0].id;
}

saveState(false);
render();

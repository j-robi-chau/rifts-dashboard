const STORAGE_KEY = "rifts_dashboard_v1";
const DEFAULT_EMPTY_NOTE = "(no note)";

const defaultStats = () => ({
  ppe: 50,
  sdc: 30,
  mdc: 20,
  hp: 0,
  isp: 0,
  attacks: 4,
});

const CORE_STAT_CONFIG = [
  { key: "ppe", label: "PPE", requiresReason: true, deletable: false },
  { key: "sdc", label: "SDC", requiresReason: true, deletable: false },
  { key: "mdc", label: "MDC", requiresReason: true, deletable: false },
  { key: "hp", label: "HP", requiresReason: true, deletable: false },
  { key: "isp", label: "ISP", requiresReason: true, deletable: false },
  { key: "attacks", label: "Attacks per Melee", requiresReason: false, deletable: false },
];

const state = loadState();

const addCharacterForm = document.querySelector("#add-character-form");
const newCharacterNameInput = document.querySelector("#new-character-name");
const partyList = document.querySelector("#party-list");
const emptyDetail = document.querySelector("#empty-detail");
const detailPanel = document.querySelector("#character-detail");
const detailNameInput = document.querySelector("#detail-name");
const editBaseStatsButton = document.querySelector("#edit-base-stats");
const addStatBlockButton = document.querySelector("#add-stat-block");
const deleteCharacterButton = document.querySelector("#delete-character");
const statsGrid = document.querySelector("#stats-grid");
const characterNotes = document.querySelector("#character-notes");
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

const baseStatsDialog = document.querySelector("#base-stats-dialog");
const baseStatsForm = document.querySelector("#base-stats-form");
const basePpeInput = document.querySelector("#base-ppe");
const baseSdcInput = document.querySelector("#base-sdc");
const baseMdcInput = document.querySelector("#base-mdc");
const baseHpInput = document.querySelector("#base-hp");
const baseIspInput = document.querySelector("#base-isp");
const baseAttacksInput = document.querySelector("#base-attacks");
const applyBaseToCurrentInput = document.querySelector("#apply-base-to-current");

const partyItemTemplate = document.querySelector("#party-item-template");
const statRowTemplate = document.querySelector("#stat-row-template");
const ammoItemTemplate = document.querySelector("#ammo-item-template");

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

function normalizeReason(reason) {
  const trimmed = (reason || "").trim();
  return trimmed || DEFAULT_EMPTY_NOTE;
}

function requiresReasonForType(type) {
  const normalized = (type || "").trim().toUpperCase();
  return normalized !== "APM";
}

function buildBaseStats(character, defaults) {
  const currentStats = character.stats || defaults;
  const existingBase = character.baseStats || {};

  return {
    ppe: normalizeStatValue(existingBase.ppe, normalizeStatValue(currentStats.ppe, defaults.ppe)),
    sdc: normalizeStatValue(existingBase.sdc, normalizeStatValue(currentStats.sdc, defaults.sdc)),
    mdc: normalizeStatValue(existingBase.mdc, normalizeStatValue(currentStats.mdc, defaults.mdc)),
    hp: normalizeStatValue(existingBase.hp, normalizeStatValue(currentStats.hp, 0)),
    isp: normalizeStatValue(existingBase.isp, normalizeStatValue(currentStats.isp, 0)),
    attacks: normalizeStatValue(existingBase.attacks, normalizeStatValue(currentStats.attacks, defaults.attacks)),
  };
}

function normalizeCustomStat(entry, index) {
  const id = entry.id || uid();
  const type = (entry.type || "CUSTOM").toString().trim().toUpperCase() || "CUSTOM";
  const label = (entry.label || `Custom ${index + 1}`).toString().trim() || `Custom ${index + 1}`;
  const base = normalizeStatValue(entry.base, normalizeStatValue(entry.current, 0));
  const current = normalizeStatValue(entry.current, base);

  return {
    id,
    type,
    label,
    current,
    base,
  };
}

function ensureCollapseState(character) {
  if (!character.collapsedStats || typeof character.collapsedStats !== "object") {
    character.collapsedStats = {};
  }

  CORE_STAT_CONFIG.forEach((entry) => {
    const key = `core:${entry.key}`;
    if (typeof character.collapsedStats[key] !== "boolean") {
      character.collapsedStats[key] = false;
    }
  });

  character.customStats.forEach((entry) => {
    const key = `custom:${entry.id}`;
    if (typeof character.collapsedStats[key] !== "boolean") {
      character.collapsedStats[key] = false;
    }
  });
}

function sanitizeForDisplay(stateToFix) {
  stateToFix.characters.forEach((character) => {
    const defaults = defaultStats();
    character.stats ||= defaults;

    character.stats = {
      ppe: normalizeStatValue(character.stats.ppe, defaults.ppe),
      sdc: normalizeStatValue(character.stats.sdc, defaults.sdc),
      mdc: normalizeStatValue(character.stats.mdc, defaults.mdc),
      hp: normalizeStatValue(character.stats.hp, 0),
      isp: normalizeStatValue(character.stats.isp, 0),
      attacks: normalizeStatValue(character.stats.attacks, defaults.attacks),
    };

    character.baseStats = buildBaseStats(character, defaults);

    if (!Array.isArray(character.customStats)) {
      character.customStats = [];
    }
    character.customStats = character.customStats.map((entry, index) => normalizeCustomStat(entry, index));

    character.notes = typeof character.notes === "string" ? character.notes : "";

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

    character.history.forEach((entry) => {
      entry.reason = normalizeReason(entry.reason);
    });

    ensureCollapseState(character);
  });

  stateToFix.history.forEach((entry) => {
    entry.reason = normalizeReason(entry.reason);
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

function createCharacter(name, baseStats) {
  const character = {
    id: uid(),
    name,
    stats: { ...baseStats },
    baseStats: { ...baseStats },
    customStats: [],
    collapsedStats: {},
    notes: "",
    ammo: [],
    history: [],
  };
  ensureCollapseState(character);
  return character;
}

function getStatEntries(character) {
  const coreEntries = CORE_STAT_CONFIG.map((entry) => ({
    id: entry.key,
    collapseKey: `core:${entry.key}`,
    kind: "core",
    type: entry.key.toUpperCase(),
    label: entry.label,
    requiresReason: entry.requiresReason,
    deletable: entry.deletable,
    getCurrent: () => character.stats[entry.key],
    getBase: () => character.baseStats[entry.key],
    setCurrent: (value) => {
      character.stats[entry.key] = value;
    },
  }));

  const customEntries = character.customStats.map((entry) => ({
    id: entry.id,
    collapseKey: `custom:${entry.id}`,
    kind: "custom",
    type: entry.type,
    label: entry.label,
    requiresReason: requiresReasonForType(entry.type),
    deletable: true,
    getCurrent: () => entry.current,
    getBase: () => entry.base,
    setCurrent: (value) => {
      entry.current = value;
    },
  }));

  return [...coreEntries, ...customEntries];
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

    meta.textContent = `PPE ${character.stats.ppe} • SDC ${character.stats.sdc} • MDC ${character.stats.mdc} • HP ${character.stats.hp} • ISP ${character.stats.isp}`;

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
  characterNotes.value = character.notes;
  renderStats(character);
  renderAmmo(character);
  renderCharacterHistory(character);
}

function queueStatChange({ character, entry, delta, context }) {
  const applyChange = (reason) => {
    const before = entry.getCurrent();
    const next = Math.max(0, before + delta);
    entry.setCurrent(next);
    const appliedDelta = next - before;
    pushHistory(character, `${entry.label} ${appliedDelta >= 0 ? "+" : ""}${appliedDelta} (${next})`, reason, appliedDelta);
  };

  if (!entry.requiresReason) {
    applyChange("");
    return;
  }

  queueChange({
    context,
    apply: (reason) => {
      applyChange(reason);
    },
  });
}

function resetStatToBase(character, entry) {
  const before = entry.getCurrent();
  const next = entry.getBase();
  entry.setCurrent(next);
  const delta = next - before;
  pushHistory(character, `${entry.label} reset to base (${next})`, "Reset to base", delta);
}

function deleteStatBlock(character, entry) {
  if (!entry.deletable || entry.kind !== "custom") {
    return;
  }

  const confirmed = window.confirm(`Delete stat block "${entry.label}"?`);
  if (!confirmed) {
    return;
  }

  character.customStats = character.customStats.filter((stat) => stat.id !== entry.id);
  delete character.collapsedStats[entry.collapseKey];
  pushHistory(character, `Deleted stat block: ${entry.label}`, "", 0);
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
  ensureCollapseState(character);
  statsGrid.innerHTML = "";
  const entries = getStatEntries(character);

  entries.forEach((entry) => {
    const fragment = statRowTemplate.content.cloneNode(true);
    const label = fragment.querySelector(".stat-label");
    const headerValue = fragment.querySelector(".stat-header-value");
    const value = fragment.querySelector(".stat-value");
    const body = fragment.querySelector(".stat-body");
    const toggleButton = fragment.querySelector(".toggle-stat");
    const quickButtons = fragment.querySelectorAll(".quick-controls button[data-delta]");
    const deleteButton = fragment.querySelector(".delete-stat-block");
    const resetButton = fragment.querySelector(".reset-to-base");
    const customAmountInput = fragment.querySelector(".mod-input");

    const currentValue = entry.getCurrent();
    const baseValue = entry.getBase();
    const collapsed = character.collapsedStats[entry.collapseKey] === true;

    label.textContent = entry.label;
    headerValue.textContent = `${currentValue}`;
    value.textContent = `${currentValue} (Base ${baseValue})`;

    body.hidden = collapsed;
    toggleButton.textContent = collapsed ? "▸" : "▾";
    toggleButton.addEventListener("click", () => {
      character.collapsedStats[entry.collapseKey] = !character.collapsedStats[entry.collapseKey];
      saveState();
      renderStats(character);
    });

    deleteButton.hidden = !entry.deletable;
    deleteButton.addEventListener("click", () => {
      deleteStatBlock(character, entry);
    });

    quickButtons.forEach((button) => {
      const buttonDelta = asInt(button.dataset.delta, 0);
      if ((entry.type === "APM" || entry.label === "Attacks per Melee") && Math.abs(buttonDelta) === 5) {
        button.hidden = true;
        return;
      }

      button.addEventListener("click", () => {
        queueStatChange({
          character,
          entry,
          delta: buttonDelta,
          context: `${character.name}: ${entry.label} ${buttonDelta >= 0 ? "+" : ""}${buttonDelta}`,
        });
      });
    });

    resetButton.addEventListener("click", () => {
      resetStatToBase(character, entry);
    });

    wireCustomAdjustment({
      customAmountInput,
      onApply: (delta) => {
        queueStatChange({
          character,
          entry,
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

function setHistoryReason(character, entryId, reason) {
  const updatedReason = normalizeReason(reason);
  const characterEntry = character.history.find((entry) => entry.id === entryId);
  if (characterEntry) {
    characterEntry.reason = updatedReason;
  }

  const globalEntry = state.history.find((entry) => entry.id === entryId);
  if (globalEntry) {
    globalEntry.reason = updatedReason;
  }

  saveState();
  renderCharacterHistory(character);
  renderGlobalHistory();
}

function renderCharacterHistory(character) {
  characterHistory.innerHTML = "";

  character.history.slice(0, 50).forEach((entry) => {
    const li = document.createElement("li");

    const line = document.createElement("p");
    line.className = "history-line";
    line.textContent = `[${entry.time}] ${entry.text} — ${normalizeReason(entry.reason)}`;

    const controls = document.createElement("div");
    controls.className = "history-edit-controls";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "secondary";
    editButton.textContent = "Edit";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "history-edit-input";
    input.value = normalizeReason(entry.reason) === DEFAULT_EMPTY_NOTE ? "" : normalizeReason(entry.reason);
    input.hidden = true;

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save";
    saveButton.hidden = true;

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "secondary";
    cancelButton.textContent = "Cancel";
    cancelButton.hidden = true;

    editButton.addEventListener("click", () => {
      editButton.hidden = true;
      input.hidden = false;
      saveButton.hidden = false;
      cancelButton.hidden = false;
      input.focus();
    });

    saveButton.addEventListener("click", () => {
      setHistoryReason(character, entry.id, input.value);
    });

    cancelButton.addEventListener("click", () => {
      input.value = normalizeReason(entry.reason) === DEFAULT_EMPTY_NOTE ? "" : normalizeReason(entry.reason);
      input.hidden = true;
      saveButton.hidden = true;
      cancelButton.hidden = true;
      editButton.hidden = false;
    });

    controls.append(editButton, input, saveButton, cancelButton);
    li.append(line, controls);
    characterHistory.append(li);
  });
}

function renderGlobalHistory() {
  globalHistory.innerHTML = "";

  state.history.slice(0, 100).forEach((entry) => {
    const li = document.createElement("li");
    const line = document.createElement("p");
    line.className = "history-line";
    line.textContent = `[${entry.time}] ${entry.character}: ${entry.text} — ${normalizeReason(entry.reason)}`;
    li.append(line);
    globalHistory.append(li);
  });
}

function pushHistory(character, text, reason, delta = null) {
  const entry = {
    id: uid(),
    character: character.name,
    text,
    reason: normalizeReason(reason),
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

function promptForBaseStats(seed = defaultStats()) {
  const ppe = window.prompt("Base PPE", `${seed.ppe}`);
  if (ppe === null) return null;

  const sdc = window.prompt("Base SDC", `${seed.sdc}`);
  if (sdc === null) return null;

  const mdc = window.prompt("Base MDC", `${seed.mdc}`);
  if (mdc === null) return null;

  const hp = window.prompt("Base HP", `${seed.hp}`);
  if (hp === null) return null;

  const isp = window.prompt("Base ISP", `${seed.isp}`);
  if (isp === null) return null;

  const attacks = window.prompt("Base Attacks per melee", `${seed.attacks}`);
  if (attacks === null) return null;

  return {
    ppe: Math.max(0, asInt(ppe, seed.ppe)),
    sdc: Math.max(0, asInt(sdc, seed.sdc)),
    mdc: Math.max(0, asInt(mdc, seed.mdc)),
    hp: Math.max(0, asInt(hp, seed.hp)),
    isp: Math.max(0, asInt(isp, seed.isp)),
    attacks: Math.max(0, asInt(attacks, seed.attacks)),
  };
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

  character.name = nextName;
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

editBaseStatsButton.addEventListener("click", () => {
  const character = selectedCharacter();
  if (!character) {
    return;
  }

  basePpeInput.value = character.baseStats.ppe;
  baseSdcInput.value = character.baseStats.sdc;
  baseMdcInput.value = character.baseStats.mdc;
  baseHpInput.value = character.baseStats.hp;
  baseIspInput.value = character.baseStats.isp;
  baseAttacksInput.value = character.baseStats.attacks;
  applyBaseToCurrentInput.checked = false;
  baseStatsDialog.showModal();
});

addStatBlockButton.addEventListener("click", () => {
  const character = selectedCharacter();
  if (!character) {
    return;
  }

  const typeInput = window.prompt("Stat type (Custom, PPE, SDC, MDC, HP, ISP, APM)", "Custom");
  if (typeInput === null) {
    return;
  }

  const normalizedType = typeInput.trim().toUpperCase() || "CUSTOM";
  const allowed = ["CUSTOM", "PPE", "SDC", "MDC", "HP", "ISP", "APM"];
  const type = allowed.includes(normalizedType) ? normalizedType : "CUSTOM";

  const label = window.prompt("Stat title/label", type === "CUSTOM" ? "Custom Stat" : type);
  if (label === null) {
    return;
  }

  const cleanLabel = label.trim();
  if (!cleanLabel) {
    window.alert("Stat title/label is required.");
    return;
  }

  const base = window.prompt("Base value", "0");
  if (base === null) {
    return;
  }

  const baseValue = Math.max(0, asInt(base, 0));

  character.customStats.push({
    id: uid(),
    type,
    label: cleanLabel,
    base: baseValue,
    current: baseValue,
  });

  ensureCollapseState(character);
  character.collapsedStats[`custom:${character.customStats[character.customStats.length - 1].id}`] = false;
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
    ppe: Math.max(0, asInt(basePpeInput.value, character.baseStats.ppe)),
    sdc: Math.max(0, asInt(baseSdcInput.value, character.baseStats.sdc)),
    mdc: Math.max(0, asInt(baseMdcInput.value, character.baseStats.mdc)),
    hp: Math.max(0, asInt(baseHpInput.value, character.baseStats.hp)),
    isp: Math.max(0, asInt(baseIspInput.value, character.baseStats.isp)),
    attacks: Math.max(0, asInt(baseAttacksInput.value, character.baseStats.attacks)),
  };

  character.baseStats = nextBase;

  if (applyBaseToCurrentInput.checked) {
    character.stats = { ...nextBase };
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

  const reason = logReasonInput.value;
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
  localStorage.removeItem(STORAGE_KEY);
  saveState();
  render();
});

if (!state.selectedCharacterId && state.characters.length > 0) {
  state.selectedCharacterId = state.characters[0].id;
}

saveState();
render();

import React, { useState, useEffect, useMemo } from "react";
import { render, Box, Text, useApp, useInput, useStdout } from "ink";
import { openStore, exportState } from "./db.js";
import { getLocalState, getOverlapWarning } from "./render.js";
import { cloudCall, useCloudBackend } from "./cloud-client.js";
import { workerStatus, statusMark } from "./status.js";
import { titleFromId } from "./db.js";
import { ago, duration } from "./time.js";
import path from "node:path";
const C = {
  brand: "#c084fc",
  // purple-400
  brandDim: "#7c3aed",
  // purple-600
  green: "#4ade80",
  // green-400
  greenDim: "#16a34a",
  // green-600
  yellow: "#facc15",
  // yellow-400
  yellowDim: "#ca8a04",
  // yellow-600
  red: "#f87171",
  // red-400
  blue: "#60a5fa",
  // blue-400
  cyan: "#22d3ee",
  // cyan-400
  dim: "#6b7280",
  // gray-500
  dimmer: "#4b5563",
  // gray-600
  text: "#e5e7eb",
  // gray-200
  textBright: "#f9fafb",
  // gray-50
  muted: "#9ca3af",
  // gray-400
  bg: "#111827"
  // gray-900
};
function statusColor(status) {
  if (status === "active") return C.green;
  if (status === "likely_active") return C.yellow;
  return C.dim;
}
function featureStatusColor(status) {
  if (status === "done") return C.green;
  if (status === "active") return C.blue;
  if (status === "blocked") return C.red;
  return C.dim;
}
function progressBar(pct, width = 16) {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round(clamped / 100 * width);
  const empty = width - filled;
  const color = clamped >= 80 ? C.green : clamped >= 40 ? C.yellow : C.red;
  return { filled: "\u2588".repeat(filled), empty: "\u2591".repeat(empty), color };
}
function normalizeState(raw) {
  const checkpoints = (raw.checkpoints || []).map((c) => {
    let files_touched = c.files_touched || [];
    if (typeof files_touched === "string") {
      try {
        files_touched = JSON.parse(files_touched);
      } catch {
        files_touched = [];
      }
    }
    let blockers = c.blockers || [];
    if (typeof blockers === "string") {
      try {
        blockers = JSON.parse(blockers);
      } catch {
        blockers = [];
      }
    }
    let next_steps = c.next_steps || c.nextSteps || [];
    if (typeof next_steps === "string") {
      try {
        next_steps = JSON.parse(next_steps);
      } catch {
        next_steps = [];
      }
    }
    return { ...c, files_touched, blockers, next_steps };
  });
  const features = (raw.features || []).map((f) => {
    let progress = f.progress;
    if (progress === void 0) {
      const latest = checkpoints.find((c) => c.feature_id === f.id);
      progress = latest ? latest.progress : 0;
    }
    return { ...f, progress };
  });
  return {
    ...raw,
    features,
    checkpoints,
    decisions: raw.decisions || [],
    sessions: raw.sessions || [],
    active_workers: raw.active_workers || []
  };
}
function fetchState(root) {
  if (useCloudBackend()) {
    return cloudCall("/state").then(normalizeState);
  }
  const store = openStore(root);
  try {
    return normalizeState(getLocalState(store));
  } finally {
    store.db.close();
  }
}
function Header({ projectName, tick }) {
  const dots = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
  const spinner = dots[tick % dots.length];
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginBottom: 1 }, /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, { color: C.brand, bold: true }, "\u250C\u2500 ideOS "), /* @__PURE__ */ React.createElement(Text, { color: C.brandDim }, "\u2500\u2500 "), /* @__PURE__ */ React.createElement(Text, { color: C.textBright, bold: true }, projectName), /* @__PURE__ */ React.createElement(Text, { color: C.brandDim }, " \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")), /* @__PURE__ */ React.createElement(Box, { marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color: C.cyan }, spinner, " "), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "Live \xB7 refreshing every 3s")));
}
function WorkersPanel({ workers }) {
  if (!workers || workers.length === 0) {
    return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginBottom: 1, marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color: C.brand, bold: true }, "\u26A1 Active Workers"), /* @__PURE__ */ React.createElement(Box, { marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "No active workers.")));
  }
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginBottom: 1, marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color: C.brand, bold: true }, "\u26A1 Active Workers"), workers.map((w, i) => {
    const status = workerStatus(w);
    const color = statusColor(status);
    const lastTime = new Date(w.last_heartbeat || w.last_file_activity || w.last_git_activity || 0).getTime();
    const diffSec = Math.max(0, Math.floor((Date.now() - lastTime) / 1e3));
    let timeStr = "";
    if (diffSec < 60) timeStr = `${diffSec}s`;
    else if (diffSec < 3600) timeStr = `${Math.floor(diffSec / 60)}m`;
    else timeStr = `${Math.floor(diffSec / 3600)}h`;
    const feature = w.current_feature || "idle";
    return /* @__PURE__ */ React.createElement(Box, { key: i, marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color }, statusMark(status), " "), /* @__PURE__ */ React.createElement(Text, { color: C.textBright, bold: true }, pad(titleFromId(w.ide), 12)), /* @__PURE__ */ React.createElement(Text, { color: C.muted }, pad(w.name || "dev", 10)), /* @__PURE__ */ React.createElement(Text, { color: C.cyan }, pad(feature, 20)), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, timeStr));
  }));
}
function FeaturesPanel({ features, selectedIdx, workers }) {
  if (!features || features.length === 0) {
    return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginBottom: 1, marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color: C.brand, bold: true }, "\u{1F4CB} Features"), /* @__PURE__ */ React.createElement(Box, { marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "No features tracked yet. Run ", /* @__PURE__ */ React.createElement(Text, { color: C.cyan, bold: true }, "ideos import"), " or ", /* @__PURE__ */ React.createElement(Text, { color: C.cyan, bold: true }, "ideos checkpoint"))));
  }
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginBottom: 1, marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color: C.brand, bold: true }, "\u{1F4CB} Features"), /* @__PURE__ */ React.createElement(Box, { marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color: C.dimmer }, pad("", 2), pad("Feature", 22), pad("Progress", 22), pad("Owner", 14), "Status")), features.slice(0, 8).map((f, i) => {
    const bar = progressBar(f.progress);
    const isSelected = i === selectedIdx;
    const pointer = isSelected ? "\u276F" : " ";
    const pointerColor = isSelected ? C.cyan : C.dim;
    const worker = (workers || []).find((w) => w.current_feature === f.id);
    const owner = worker ? titleFromId(worker.ide) : "unclaimed";
    const ownerColor = worker ? C.cyan : C.dim;
    let statusText = f.status || "planning";
    const sColor = featureStatusColor(statusText);
    return /* @__PURE__ */ React.createElement(Box, { key: i, marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color: pointerColor, bold: true }, pointer, " "), /* @__PURE__ */ React.createElement(Text, { color: isSelected ? C.textBright : C.text, bold: isSelected }, pad(f.name || f.id, 22)), /* @__PURE__ */ React.createElement(Text, { color: bar.color }, bar.filled), /* @__PURE__ */ React.createElement(Text, { color: C.dimmer }, bar.empty), /* @__PURE__ */ React.createElement(Text, { color: C.muted }, ` ${String(f.progress).padStart(3)}% `), /* @__PURE__ */ React.createElement(Text, { color: ownerColor }, pad(owner, 14)), /* @__PURE__ */ React.createElement(Text, { color: sColor }, statusText));
  }));
}
function DecisionsPanel({ decisions }) {
  if (!decisions || decisions.length === 0) {
    return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginBottom: 1, marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color: C.brand, bold: true }, "\u{1F4A1} Decisions"), /* @__PURE__ */ React.createElement(Box, { marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "No decisions recorded.")));
  }
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginBottom: 1, marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color: C.brand, bold: true }, "\u{1F4A1} Decisions"), decisions.slice(0, 5).map((d, i) => /* @__PURE__ */ React.createElement(Box, { key: i, marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color: C.yellow }, pad(d.key, 20)), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "\u2192 "), /* @__PURE__ */ React.createElement(Text, { color: C.text }, d.value))));
}
function WarningPanel({ warning }) {
  if (!warning) return null;
  return /* @__PURE__ */ React.createElement(Box, { marginLeft: 2, marginBottom: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.red, bold: true }, "\u26A0  "), /* @__PURE__ */ React.createElement(Text, { color: C.yellow }, warning));
}
function SnapshotInfo({ checkpoints }) {
  const latest = checkpoints?.[0];
  const str = latest ? ago(latest.created_at) : "none";
  return /* @__PURE__ */ React.createElement(Box, { marginLeft: 2, marginBottom: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "Last snapshot: "), /* @__PURE__ */ React.createElement(Text, { color: latest ? C.muted : C.dim }, str), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "  \xB7  "), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, `${checkpoints?.length || 0} total checkpoints`));
}
function Footer({ view }) {
  if (view === "main") {
    return /* @__PURE__ */ React.createElement(Box, { marginLeft: 2, marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.brandDim }, "\u2500".repeat(56)), /* @__PURE__ */ React.createElement(Text, null, "\n"), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "  "), /* @__PURE__ */ React.createElement(Text, { color: C.cyan, bold: true }, "\u2191\u2193"), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, " navigate  "), /* @__PURE__ */ React.createElement(Text, { color: C.cyan, bold: true }, "Enter"), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, " explain  "), /* @__PURE__ */ React.createElement(Text, { color: C.cyan, bold: true }, "t"), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, " timeline  "), /* @__PURE__ */ React.createElement(Text, { color: C.cyan, bold: true }, "r"), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, " resume  "), /* @__PURE__ */ React.createElement(Text, { color: C.cyan, bold: true }, "q"), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, " quit"));
  }
  return /* @__PURE__ */ React.createElement(Box, { marginLeft: 2, marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.brandDim }, "\u2500".repeat(56)), /* @__PURE__ */ React.createElement(Text, null, "\n"), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "  "), /* @__PURE__ */ React.createElement(Text, { color: C.cyan, bold: true }, "Esc"), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, " back  "), /* @__PURE__ */ React.createElement(Text, { color: C.cyan, bold: true }, "q"), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, " quit"));
}
function ExplainView({ feature, state }) {
  if (!feature) {
    return /* @__PURE__ */ React.createElement(Box, { marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "Feature not found."));
  }
  const checkpoints = state.checkpoints.filter((c) => c.feature_id === feature.id);
  const latest = checkpoints[0];
  const decisions = state.decisions.filter((d) => d.feature_id === feature.id || d.feature_id == null);
  const workers = state.active_workers.filter((w) => w.current_feature === feature.id);
  const files = [...new Set(checkpoints.flatMap((c) => c.files_touched || []))].slice(0, 12);
  const remaining = feature.status === "done" ? [] : [...new Set(checkpoints.flatMap((c) => c.next_steps || []))].filter(Boolean);
  const blockers = [...new Set(checkpoints.flatMap((c) => c.blockers || []))].filter(Boolean);
  const bar = progressBar(latest?.progress ?? 0, 20);
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginLeft: 2 }, /* @__PURE__ */ React.createElement(Box, { marginBottom: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.brand, bold: true }, "\u{1F50D} "), /* @__PURE__ */ React.createElement(Text, { color: C.textBright, bold: true }, feature.name || feature.id), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, `  (${feature.id})`)), /* @__PURE__ */ React.createElement(Box, { marginLeft: 2, marginBottom: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "Status: "), /* @__PURE__ */ React.createElement(Text, { color: featureStatusColor(feature.status), bold: true }, feature.status || "planning"), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "  \xB7  "), /* @__PURE__ */ React.createElement(Text, { color: bar.color }, bar.filled), /* @__PURE__ */ React.createElement(Text, { color: C.dimmer }, bar.empty), /* @__PURE__ */ React.createElement(Text, { color: C.muted }, ` ${latest?.progress ?? 0}%`)), feature.description && /* @__PURE__ */ React.createElement(Box, { marginLeft: 2, marginBottom: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "Goal: "), /* @__PURE__ */ React.createElement(Text, { color: C.text }, feature.description)), /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginLeft: 2, marginBottom: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.yellow, bold: true }, "Workers"), workers.length === 0 ? /* @__PURE__ */ React.createElement(Box, { marginLeft: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "none assigned")) : workers.map((w, i) => {
    const s = workerStatus(w);
    return /* @__PURE__ */ React.createElement(Box, { key: i, marginLeft: 1 }, /* @__PURE__ */ React.createElement(Text, { color: statusColor(s) }, statusMark(s), " "), /* @__PURE__ */ React.createElement(Text, { color: C.text }, titleFromId(w.ide), " (", w.name, ")"), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, `  ${ago(w.last_heartbeat || w.last_file_activity || w.last_git_activity)}`));
  })), /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginLeft: 2, marginBottom: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.green, bold: true }, "Completed"), checkpoints.slice(0, 6).map((c, i) => /* @__PURE__ */ React.createElement(Box, { key: i, marginLeft: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "\u2192 "), /* @__PURE__ */ React.createElement(Text, { color: C.text }, c.summary))), checkpoints.length === 0 && /* @__PURE__ */ React.createElement(Box, { marginLeft: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "none recorded"))), remaining.length > 0 && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginLeft: 2, marginBottom: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.cyan, bold: true }, "Remaining"), remaining.slice(0, 5).map((s, i) => /* @__PURE__ */ React.createElement(Box, { key: i, marginLeft: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "\u2192 "), /* @__PURE__ */ React.createElement(Text, { color: C.text }, s)))), blockers.length > 0 && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginLeft: 2, marginBottom: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.red, bold: true }, "Blockers"), blockers.map((b, i) => /* @__PURE__ */ React.createElement(Box, { key: i, marginLeft: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.red }, "! "), /* @__PURE__ */ React.createElement(Text, { color: C.text }, b)))), decisions.length > 0 && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginLeft: 2, marginBottom: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.yellow, bold: true }, "Decisions"), decisions.slice(0, 5).map((d, i) => /* @__PURE__ */ React.createElement(Box, { key: i, marginLeft: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.yellow }, pad(d.key, 18)), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "\u2192 "), /* @__PURE__ */ React.createElement(Text, { color: C.text }, d.value)))), files.length > 0 && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginLeft: 2, marginBottom: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.blue, bold: true }, "Files Touched"), /* @__PURE__ */ React.createElement(Box, { marginLeft: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.dim }, files.join("  \xB7  ")))));
}
function TimelineView({ feature, state }) {
  if (!feature) {
    return /* @__PURE__ */ React.createElement(Box, { marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "Feature not found."));
  }
  const sessions = state.sessions.filter((s) => s.feature_id === feature.id);
  const checkpoints = state.checkpoints.filter((c) => c.feature_id === feature.id);
  const decisions = state.decisions.filter((d) => d.feature_id === feature.id);
  const events = [];
  for (const s of sessions) {
    events.push({ at: s.started_at, type: "session", text: `${titleFromId(s.ide)} session started`, color: C.blue });
    if (s.ended_at) events.push({ at: s.ended_at, type: "session_end", text: `session ended (${duration(s.started_at, s.ended_at)})`, color: C.dim });
  }
  for (const c of checkpoints) {
    events.push({ at: c.created_at, type: "checkpoint", text: c.summary, color: C.green });
  }
  for (const d of decisions) {
    events.push({ at: d.created_at, type: "decision", text: `${d.key}: ${d.value}`, color: C.yellow });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));
  if (events.length === 0) {
    return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color: C.brand, bold: true }, "\u{1F4C5} ", feature.name, " \xB7 Timeline"), /* @__PURE__ */ React.createElement(Box, { marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "No events yet.")));
  }
  const days = {};
  for (const e of events) {
    const d = new Date(e.at);
    if (Number.isNaN(d.getTime())) continue;
    const key = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).replace(",", "");
    if (!days[key]) days[key] = [];
    days[key].push(e);
  }
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginLeft: 2 }, /* @__PURE__ */ React.createElement(Box, { marginBottom: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.brand, bold: true }, "\u{1F4C5} "), /* @__PURE__ */ React.createElement(Text, { color: C.textBright, bold: true }, feature.name), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, " \xB7 Timeline")), Object.entries(days).map(([day, events2]) => /* @__PURE__ */ React.createElement(Box, { key: day, flexDirection: "column", marginBottom: 1 }, /* @__PURE__ */ React.createElement(Box, { marginLeft: 1 }, /* @__PURE__ */ React.createElement(Text, { color: C.muted, bold: true }, day)), events2.map((e, i) => {
    const d = new Date(e.at);
    const time = d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
    const icon = e.type === "checkpoint" ? "\u25CF" : e.type === "decision" ? "\u25C6" : "\u25CB";
    return /* @__PURE__ */ React.createElement(Box, { key: i, marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color: C.dim }, time, "  "), /* @__PURE__ */ React.createElement(Text, { color: e.color }, icon, " "), /* @__PURE__ */ React.createElement(Text, { color: C.text }, e.text));
  }))));
}
function Dashboard({ root }) {
  const { exit } = useApp();
  const projectName = path.basename(root);
  const [state, setState] = useState(null);
  const [tick, setTick] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [view, setView] = useState("main");
  const [viewFeature, setViewFeature] = useState(null);
  useEffect(() => {
    const load = async () => {
      try {
        const s = await fetchState(root);
        setState(s);
      } catch (err) {
      }
    };
    load();
    const interval = setInterval(() => {
      load();
      setTick((t) => t + 1);
    }, 3e3);
    return () => clearInterval(interval);
  }, [root]);
  useInput((input, key) => {
    if (input === "q") {
      exit();
      return;
    }
    if (view !== "main") {
      if (key.escape || input === "b") {
        setView("main");
        setViewFeature(null);
      }
      return;
    }
    const featureCount = state?.features?.length || 0;
    if (key.upArrow) {
      setSelectedIdx((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIdx((i) => Math.min(featureCount - 1, i + 1));
    } else if (key.return) {
      if (featureCount > 0) {
        setViewFeature(state.features[selectedIdx]);
        setView("explain");
      }
    } else if (input === "t") {
      if (featureCount > 0) {
        setViewFeature(state.features[selectedIdx]);
        setView("timeline");
      }
    } else if (input === "r") {
      if (featureCount > 0) {
        setViewFeature(state.features[selectedIdx]);
        setView("explain");
      }
    }
  });
  if (!state) {
    return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginLeft: 2 }, /* @__PURE__ */ React.createElement(Text, { color: C.brand, bold: true }, "ideOS"), /* @__PURE__ */ React.createElement(Text, { color: C.dim }, "Loading workspace state..."));
  }
  const overlapWarning = getOverlapWarning(state);
  if (view === "explain") {
    return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column" }, /* @__PURE__ */ React.createElement(Header, { projectName, tick }), /* @__PURE__ */ React.createElement(ExplainView, { feature: viewFeature, state }), /* @__PURE__ */ React.createElement(Footer, { view: "detail" }));
  }
  if (view === "timeline") {
    return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column" }, /* @__PURE__ */ React.createElement(Header, { projectName, tick }), /* @__PURE__ */ React.createElement(TimelineView, { feature: viewFeature, state }), /* @__PURE__ */ React.createElement(Footer, { view: "detail" }));
  }
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column" }, /* @__PURE__ */ React.createElement(Header, { projectName, tick }), /* @__PURE__ */ React.createElement(WorkersPanel, { workers: state.active_workers }), /* @__PURE__ */ React.createElement(FeaturesPanel, { features: state.features, selectedIdx, workers: state.active_workers }), /* @__PURE__ */ React.createElement(DecisionsPanel, { decisions: state.decisions }), /* @__PURE__ */ React.createElement(WarningPanel, { warning: overlapWarning }), /* @__PURE__ */ React.createElement(SnapshotInfo, { checkpoints: state.checkpoints }), /* @__PURE__ */ React.createElement(Footer, { view: "main" }));
}
function pad(text, width) {
  const s = String(text ?? "");
  return s.length > width ? s.slice(0, width - 1) + "\u2026" : s.padEnd(width);
}
function launchDashboard(root) {
  const app = render(React.createElement(Dashboard, { root }));
  return app;
}
export {
  launchDashboard
};

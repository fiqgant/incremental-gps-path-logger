(() => {
  "use strict";

  const CONFIG = {
    minDistanceMeters: 5,
    minIntervalMs: 3000,
    maxAccuracyMeters: 50,
    speedStaleMs: 6000,
    firstFixTimeoutMs: 20000,
    defaultCenter: { lat: 3.5952, lng: 98.6722 },
    storageKey: "gpsNavAppDataV1"
  };

  const state = {
    trackingActive: false,
    watchId: null,
    simulationActive: false,
    simulationTimerId: null,
    firstFixTimerId: null,
    simulationPoints: [],
    simulationIndex: 0,
    path: [],
    totalDistance: 0,
    ignoredPoints: 0,
    lastIgnoredReason: "-",
    startTime: null,
    endTime: null,
    lastUpdate: null,
    latestRaw: null
  };

  const ui = {};
  let map;
  let currentMarker = null;
  let startMarker = null;
  let endMarker = null;
  let pathLine = null;

  function init() {
    bindUI();
    initMap();
    loadFromLocalStorage();
    renderAll();
    appendLog("Application ready.");
    showStatus("Status: Ready", "neutral");
    setInterval(updateDurationAndSpeedOnly, 1000);
  }

  function bindUI() {
    ui.globalStatus = document.getElementById("globalStatus");
    ui.statTrackingStatus = document.getElementById("statTrackingStatus");
    ui.statLat = document.getElementById("statLat");
    ui.statLng = document.getElementById("statLng");
    ui.statAccuracy = document.getElementById("statAccuracy");
    ui.statAltitude = document.getElementById("statAltitude");
    ui.statSpeed = document.getElementById("statSpeed");
    ui.statPoints = document.getElementById("statPoints");
    ui.statDistanceM = document.getElementById("statDistanceM");
    ui.statDistanceKm = document.getElementById("statDistanceKm");
    ui.statDuration = document.getElementById("statDuration");
    ui.statAvgSpeed = document.getElementById("statAvgSpeed");
    ui.statLastUpdate = document.getElementById("statLastUpdate");
    ui.statIgnoredPoints = document.getElementById("statIgnoredPoints");
    ui.statIgnoredReason = document.getElementById("statIgnoredReason");
    ui.activityLog = document.getElementById("activityLog");
    ui.btnStart = document.getElementById("btnStart");
    ui.btnStop = document.getElementById("btnStop");
    ui.btnReset = document.getElementById("btnReset");
    ui.btnExport = document.getElementById("btnExport");
    ui.btnImport = document.getElementById("btnImport");
    ui.btnLoadSample = document.getElementById("btnLoadSample");
    ui.btnSimulate = document.getElementById("btnSimulate");
    ui.btnStopSim = document.getElementById("btnStopSim");
    ui.btnCenter = document.getElementById("btnCenter");
    ui.importFileInput = document.getElementById("importFileInput");
    ui.dialSpeedKmh = document.getElementById("dialSpeedKmh");
    ui.dialHeading = document.getElementById("dialHeading");
    ui.dialTrip = document.getElementById("dialTrip");
    ui.dialQualityText = document.getElementById("dialQualityText");
    ui.dialQualityBar = document.getElementById("dialQualityBar");
    ui.lampTracking = document.getElementById("lampTracking");
    ui.lampSimulation = document.getElementById("lampSimulation");
    ui.lampGps = document.getElementById("lampGps");
    ui.sessionSummaryModal = document.getElementById("sessionSummaryModal");
    ui.sessionSummaryBackdrop = document.getElementById("sessionSummaryBackdrop");
    ui.sessionSummaryCloseTop = document.getElementById("sessionSummaryCloseTop");
    ui.sessionSummaryCloseBtn = document.getElementById("sessionSummaryCloseBtn");
    ui.sessionMode = document.getElementById("sessionMode");
    ui.sessionDistanceKm = document.getElementById("sessionDistanceKm");
    ui.sessionDuration = document.getElementById("sessionDuration");
    ui.sessionAvgSpeed = document.getElementById("sessionAvgSpeed");
    ui.sessionMaxSpeed = document.getElementById("sessionMaxSpeed");
    ui.sessionPoints = document.getElementById("sessionPoints");
    ui.sessionIgnored = document.getElementById("sessionIgnored");
    ui.sessionStart = document.getElementById("sessionStart");
    ui.sessionEnd = document.getElementById("sessionEnd");

    ui.btnStart.addEventListener("click", startTracking);
    ui.btnStop.addEventListener("click", stopTracking);
    ui.btnReset.addEventListener("click", resetPath);
    ui.btnExport.addEventListener("click", exportJSON);
    ui.btnImport.addEventListener("click", () => ui.importFileInput.click());
    ui.btnLoadSample.addEventListener("click", loadSampleData);
    ui.btnSimulate.addEventListener("click", startSimulation);
    ui.btnStopSim.addEventListener("click", stopSimulation);
    ui.btnCenter.addEventListener("click", centerMap);
    ui.importFileInput.addEventListener("change", importJSON);

    if (ui.sessionSummaryCloseBtn) {
      ui.sessionSummaryCloseBtn.addEventListener("click", hideSessionSummary);
    }
    if (ui.sessionSummaryCloseTop) {
      ui.sessionSummaryCloseTop.addEventListener("click", hideSessionSummary);
    }
    if (ui.sessionSummaryBackdrop) {
      ui.sessionSummaryBackdrop.addEventListener("click", hideSessionSummary);
    }
  }

  function initMap() {
    map = L.map("map").setView([CONFIG.defaultCenter.lat, CONFIG.defaultCenter.lng], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    pathLine = L.polyline([], { color: "#3b82f6", weight: 4, opacity: 0.85 }).addTo(map);
  }

  function startTracking() {
    hideSessionSummary();

    if (state.trackingActive) {
      appendLog("Tracking already active.");
      return;
    }

    if (!("geolocation" in navigator)) {
      appendLog("Geolocation is not supported by this browser.");
      showStatus("Status: GPS Not Supported", "stopped");
      return;
    }

    if (state.simulationActive) {
      stopSimulation();
    }

    const secureOk = window.isSecureContext || location.hostname === "localhost";
    if (!secureOk) {
      appendLog("Tracking blocked: Geolocation requires HTTPS or localhost.");
      showStatus("Status: HTTPS Required", "stopped");
      return;
    }

    if (navigator.permissions && typeof navigator.permissions.query === "function") {
      navigator.permissions.query({ name: "geolocation" }).then((result) => {
        if (result.state === "denied") {
          appendLog("Location permission is denied. Enable location access in browser settings.");
          showStatus("Status: Permission Denied", "stopped");
        }
      }).catch(() => {});
    }

    if (!state.startTime) {
      state.startTime = new Date().toISOString();
    }
    state.endTime = null;
    state.trackingActive = true;
    renderAll();
    showStatus("Status: Tracking Active", "active");
    appendLog("Tracking started.");

    state.watchId = navigator.geolocation.watchPosition(
      onGeoSuccess,
      onGeoError,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    if (state.firstFixTimerId !== null) {
      clearTimeout(state.firstFixTimerId);
    }
    state.firstFixTimerId = window.setTimeout(() => {
      if (!state.latestRaw && state.path.length === 0 && state.trackingActive) {
        appendLog("No GPS fix yet. Move to open sky or check device location services.");
        showStatus("Status: Waiting GPS Fix", "neutral");
      }
    }, CONFIG.firstFixTimeoutMs);
  }

  function stopTracking(showSummary = true) {
    if (state.watchId !== null) {
      navigator.geolocation.clearWatch(state.watchId);
      state.watchId = null;
    }

    if (!state.trackingActive) {
      appendLog("Tracking already stopped.");
      return;
    }

    if (state.firstFixTimerId !== null) {
      clearTimeout(state.firstFixTimerId);
      state.firstFixTimerId = null;
    }

    state.trackingActive = false;
    state.endTime = new Date().toISOString();
    persistState();
    renderAll();
    showStatus("Status: Tracking Stopped", "stopped");
    appendLog("Tracking stopped.");

    if (showSummary) {
      showSessionSummary("Tracking");
    }
  }

  function onGeoSuccess(position) {
    if (state.firstFixTimerId !== null) {
      clearTimeout(state.firstFixTimerId);
      state.firstFixTimerId = null;
    }

    const p = normalizePosition(position.coords, position.timestamp);
    state.latestRaw = p;
    processIncomingPoint(p, true);
  }

  function onGeoError(error) {
    let message = "Geolocation error.";
    if (error && typeof error.code === "number") {
      if (error.code === 1) message = "Location permission denied by user/browser.";
      if (error.code === 2) message = "Position unavailable. Turn on GPS and move to open area.";
      if (error.code === 3) message = "Location request timeout. GPS signal is weak.";
    }

    if (state.firstFixTimerId !== null) {
      clearTimeout(state.firstFixTimerId);
      state.firstFixTimerId = null;
    }

    appendLog(message);
    showStatus("Status: GPS Error", "stopped");
  }

  function normalizePosition(coords, timestampMs) {
    return {
      lat: Number(coords.latitude),
      lng: Number(coords.longitude),
      accuracy: toFiniteOrNull(coords.accuracy),
      altitude: toFiniteOrNull(coords.altitude),
      speed: toFiniteOrNull(coords.speed),
      heading: toFiniteOrNull(coords.heading),
      timestamp: new Date(timestampMs || Date.now()).toISOString()
    };
  }

  function processIncomingPoint(point, followMap) {
    updateCurrentMarker(point, followMap);
    const result = applyIncrementalLogging(point);

    if (result.saved) {
      appendLog(`GPS point saved. +${result.distanceFromPrevious.toFixed(2)} m`);
      showStatus("Status: Point Saved", "active");
      redrawPathLayers();
      persistState();
    } else {
      state.ignoredPoints += 1;
      state.lastIgnoredReason = result.reason;
      appendLog(`GPS point ignored: ${result.reason}`);

      if (state.path.length === 0 && result.reason.includes("accuracy")) {
        appendLog("Waiting for first valid point (accuracy <= 50 m).");
      }

      showStatus("Status: Point Ignored", "neutral");
      persistState();
    }

    state.lastUpdate = new Date().toISOString();
    renderAll();
  }

  function applyIncrementalLogging(point) {
    if (!isFiniteNumber(point.accuracy) || point.accuracy > CONFIG.maxAccuracyMeters) {
      return { saved: false, reason: "Poor accuracy (> 50 m)." };
    }

    if (state.path.length === 0) {
      const firstPoint = { ...point, distanceFromPrevious: 0 };
      state.path.push(firstPoint);
      if (!state.startTime) state.startTime = point.timestamp;
      state.endTime = null;
      return { saved: true, distanceFromPrevious: 0 };
    }

    const prev = state.path[state.path.length - 1];
    const dt = new Date(point.timestamp).getTime() - new Date(prev.timestamp).getTime();
    if (dt < CONFIG.minIntervalMs) {
      return { saved: false, reason: "Time interval too short (< 3 s)." };
    }

    const distance = haversineMeters(prev.lat, prev.lng, point.lat, point.lng);
    if (distance < CONFIG.minDistanceMeters) {
      return { saved: false, reason: "Point too close (< 5 m)." };
    }

    const savedPoint = { ...point, distanceFromPrevious: distance };
    state.path.push(savedPoint);
    state.totalDistance += distance;
    state.endTime = null;
    return { saved: true, distanceFromPrevious: distance };
  }

  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function updateCurrentMarker(point, followMap) {
    const latlng = [point.lat, point.lng];
    const html = `
      <strong>Current Position</strong><br/>
      Latitude: ${point.lat.toFixed(6)}<br/>
      Longitude: ${point.lng.toFixed(6)}<br/>
      Accuracy: ${formatMeters(point.accuracy)}<br/>
      Altitude: ${formatNullable(point.altitude)}<br/>
      Speed: ${formatSpeed(point.speed)}<br/>
      Heading: ${formatNullable(point.heading)}<br/>
      Timestamp: ${point.timestamp}
    `;

    if (!currentMarker) {
      currentMarker = L.marker(latlng).addTo(map).bindPopup(html);
    } else {
      currentMarker.setLatLng(latlng).setPopupContent(html);
    }

    if (followMap) {
      map.setView(latlng, Math.max(map.getZoom(), 16));
    }
  }

  function redrawPathLayers() {
    const latlngs = state.path.map((p) => [p.lat, p.lng]);
    pathLine.setLatLngs(latlngs);

    if (state.path.length > 0) {
      const start = state.path[0];
      const end = state.path[state.path.length - 1];
      const startPopup = buildPathPopup("Start Point", start);
      const endPopup = buildPathPopup("Latest Point", end);

      if (!startMarker) {
        startMarker = L.marker([start.lat, start.lng]).addTo(map).bindPopup(startPopup);
      } else {
        startMarker.setLatLng([start.lat, start.lng]).setPopupContent(startPopup);
      }

      if (!endMarker) {
        endMarker = L.marker([end.lat, end.lng]).addTo(map).bindPopup(endPopup);
      } else {
        endMarker.setLatLng([end.lat, end.lng]).setPopupContent(endPopup);
      }
    } else {
      if (startMarker) {
        map.removeLayer(startMarker);
        startMarker = null;
      }
      if (endMarker) {
        map.removeLayer(endMarker);
        endMarker = null;
      }
    }
  }

  function buildPathPopup(title, p) {
    return `
      <strong>${title}</strong><br/>
      Latitude: ${p.lat.toFixed(6)}<br/>
      Longitude: ${p.lng.toFixed(6)}<br/>
      Accuracy: ${formatMeters(p.accuracy)}<br/>
      Timestamp: ${p.timestamp}<br/>
      Distance from previous: ${Number(p.distanceFromPrevious || 0).toFixed(2)} m
    `;
  }

  function renderAll() {
    ui.statTrackingStatus.textContent = state.trackingActive ? "Active" : "Stopped";
    const latestSaved = state.path[state.path.length - 1] || state.latestRaw;
    const displaySpeedKmh = getDisplaySpeedKmh(latestSaved);
    ui.statLat.textContent = latestSaved ? latestSaved.lat.toFixed(6) : "-";
    ui.statLng.textContent = latestSaved ? latestSaved.lng.toFixed(6) : "-";
    ui.statAccuracy.textContent = latestSaved ? formatMeters(latestSaved.accuracy) : "-";
    ui.statAltitude.textContent = latestSaved ? formatNullable(latestSaved.altitude, "m") : "-";
    ui.statSpeed.textContent = `${displaySpeedKmh.toFixed(1)} km/h`;
    ui.statPoints.textContent = String(state.path.length);
    ui.statDistanceM.textContent = state.totalDistance.toFixed(2);
    ui.statDistanceKm.textContent = (state.totalDistance / 1000).toFixed(3);
    ui.statDuration.textContent = formatDurationMs(getTrackingDurationMs());
    ui.statAvgSpeed.textContent = formatAvgSpeed();
    ui.statLastUpdate.textContent = state.lastUpdate ? formatLocalDateTime(state.lastUpdate) : "-";
    ui.statIgnoredPoints.textContent = String(state.ignoredPoints);
    ui.statIgnoredReason.textContent = state.lastIgnoredReason || "-";
    renderCluster(latestSaved, displaySpeedKmh);
    redrawPathLayers();
  }

  function renderCluster(latestPoint, speedKmh) {
    const heading = latestPoint && isFiniteNumber(latestPoint.heading)
      ? Number(latestPoint.heading)
      : null;
    const accuracy = latestPoint && isFiniteNumber(latestPoint.accuracy)
      ? Number(latestPoint.accuracy)
      : null;

    if (ui.dialSpeedKmh) {
      ui.dialSpeedKmh.textContent = Math.round(speedKmh).toString();
    }

    if (ui.dialHeading) {
      if (heading === null) {
        ui.dialHeading.textContent = "-";
      } else {
        ui.dialHeading.textContent = `${heading.toFixed(0)}° ${headingToCompass(heading)}`;
      }
    }

    if (ui.dialTrip) {
      ui.dialTrip.textContent = `${(state.totalDistance / 1000).toFixed(3)} km`;
    }

    if (ui.dialQualityBar && ui.dialQualityText) {
      if (accuracy === null) {
        ui.dialQualityBar.style.width = "0%";
        ui.dialQualityText.textContent = "No signal";
      } else {
        const quality = Math.max(0, Math.min(100, ((CONFIG.maxAccuracyMeters - accuracy) / CONFIG.maxAccuracyMeters) * 100));
        ui.dialQualityBar.style.width = `${quality.toFixed(0)}%`;

        if (accuracy <= 12) ui.dialQualityText.textContent = `Excellent (${accuracy.toFixed(1)} m)`;
        else if (accuracy <= 25) ui.dialQualityText.textContent = `Good (${accuracy.toFixed(1)} m)`;
        else if (accuracy <= 50) ui.dialQualityText.textContent = `Fair (${accuracy.toFixed(1)} m)`;
        else ui.dialQualityText.textContent = `Poor (${accuracy.toFixed(1)} m)`;
      }
    }

    setLamp(ui.lampTracking, state.trackingActive, "on-green");
    setLamp(ui.lampSimulation, state.simulationActive, "on-amber");
    setLamp(ui.lampGps, !!latestPoint, "on-cyan");
  }

  function getDisplaySpeedKmh(latestPoint) {
    if (!state.trackingActive && !state.simulationActive) return 0;
    if (!latestPoint || !isFiniteNumber(latestPoint.speed)) return 0;

    const pointTime = new Date(latestPoint.timestamp).getTime();
    if (Number.isNaN(pointTime)) return 0;

    const ageMs = Date.now() - pointTime;
    if (ageMs > CONFIG.speedStaleMs) return 0;

    const speedKmh = Number(latestPoint.speed) * 3.6;
    if (!Number.isFinite(speedKmh) || speedKmh < 0.5) return 0;
    return speedKmh;
  }

  function setLamp(el, active, className) {
    if (!el) return;
    el.classList.remove("on-green", "on-amber", "on-cyan");
    if (active) el.classList.add(className);
  }

  function formatAvgSpeed() {
    const durationSec = getTrackingDurationMs() / 1000;
    if (durationSec <= 0 || state.totalDistance <= 0) return "0 km/h";
    const kmh = (state.totalDistance / durationSec) * 3.6;
    return `${kmh.toFixed(2)} km/h`;
  }

  function getTrackingDurationMs() {
    if (!state.startTime) return 0;
    const start = new Date(state.startTime).getTime();
    const end = state.trackingActive
      ? Date.now()
      : (state.endTime ? new Date(state.endTime).getTime() : Date.now());
    return Math.max(0, end - start);
  }

  function formatDurationMs(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600).toString().padStart(2, "0");
    const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, "0");
    const s = Math.floor(totalSec % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  function updateDurationAndSpeedOnly() {
    ui.statDuration.textContent = formatDurationMs(getTrackingDurationMs());
    ui.statAvgSpeed.textContent = formatAvgSpeed();
  }

  function exportJSON() {
    if (state.path.length === 0) {
      appendLog("No GPS data to export.");
      return;
    }
    const data = JSON.stringify(state.path, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const fileName = `gps-path-log-${formatFileDate(now)}.json`;
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    appendLog("Export successful.");
    showStatus("Status: Data Exported", "neutral");
  }

  function importJSON(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result));
        const validated = validateImportedPath(json);
        state.path = validated.path;
        state.totalDistance = validated.totalDistance;
        state.startTime = validated.startTime;
        state.endTime = validated.endTime;
        state.lastUpdate = new Date().toISOString();
        state.lastIgnoredReason = "-";
        state.ignoredPoints = 0;
        state.latestRaw = state.path[state.path.length - 1] || null;
        if (state.path.length > 0) {
          const last = state.path[state.path.length - 1];
          updateCurrentMarker(last, true);
        }
        persistState();
        renderAll();
        appendLog("Import successful.");
        showStatus("Status: Data Imported", "neutral");
      } catch (err) {
        appendLog(`Import failed: ${err.message}`);
        showStatus("Status: Import Error", "stopped");
      }
    };

    reader.onerror = () => {
      appendLog("Import failed: cannot read file.");
      showStatus("Status: Import Error", "stopped");
    };

    reader.readAsText(file);
  }

  function validateImportedPath(value) {
    if (!Array.isArray(value)) {
      throw new Error("Invalid JSON format: expected an array.");
    }

    let total = 0;
    const path = value.map((item, index) => {
      if (typeof item !== "object" || item === null) {
        throw new Error(`Invalid item at index ${index}: expected object.`);
      }
      const required = ["lat", "lng", "accuracy", "timestamp"];
      for (const key of required) {
        if (!(key in item)) {
          throw new Error(`Invalid item at index ${index}: missing "${key}".`);
        }
      }

      const lat = Number(item.lat);
      const lng = Number(item.lng);
      const accuracy = Number(item.accuracy);
      const timestamp = new Date(item.timestamp);

      if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
        throw new Error(`Invalid coordinates at index ${index}.`);
      }
      if (!isFiniteNumber(accuracy)) {
        throw new Error(`Invalid accuracy at index ${index}.`);
      }
      if (Number.isNaN(timestamp.getTime())) {
        throw new Error(`Invalid timestamp at index ${index}.`);
      }

      let distanceFromPrevious = Number(item.distanceFromPrevious);
      if (!isFiniteNumber(distanceFromPrevious) || distanceFromPrevious < 0) {
        if (index === 0) {
          distanceFromPrevious = 0;
        } else {
          const prev = value[index - 1];
          distanceFromPrevious = haversineMeters(
            Number(prev.lat), Number(prev.lng), lat, lng
          );
        }
      }

      total += distanceFromPrevious;

      return {
        lat,
        lng,
        accuracy,
        altitude: toFiniteOrNull(item.altitude),
        speed: toFiniteOrNull(item.speed),
        heading: toFiniteOrNull(item.heading),
        timestamp: timestamp.toISOString(),
        distanceFromPrevious
      };
    });

    return {
      path,
      totalDistance: total,
      startTime: path[0] ? path[0].timestamp : null,
      endTime: path.length ? path[path.length - 1].timestamp : null
    };
  }

  async function loadSampleData() {
    try {
      const res = await fetch("sample-path.json", { cache: "no-store" });
      if (!res.ok) throw new Error("Cannot fetch sample-path.json");
      const json = await res.json();

      const validated = validateImportedPath(json);
      state.path = validated.path;
      state.totalDistance = validated.totalDistance;
      state.startTime = validated.startTime;
      state.endTime = validated.endTime;
      state.lastUpdate = new Date().toISOString();
      state.latestRaw = state.path[state.path.length - 1] || null;

      if (state.path.length > 0) {
        const last = state.path[state.path.length - 1];
        updateCurrentMarker(last, true);
      }

      persistState();
      renderAll();
      appendLog("Sample data loaded.");
      showStatus("Status: Sample Data Loaded", "neutral");
    } catch (err) {
      appendLog(`Failed to load sample data: ${err.message}`);
      showStatus("Status: Sample Load Error", "stopped");
    }
  }

  function startSimulation() {
    hideSessionSummary();

    if (state.simulationActive) {
      appendLog("Simulation already running.");
      return;
    }

    if (state.trackingActive) {
      stopTracking(false);
    }

    state.simulationPoints = generateSimulationPoints();
    state.simulationIndex = 0;
    state.simulationActive = true;
    if (!state.startTime) state.startTime = new Date().toISOString();
    state.endTime = null;
    showStatus("Status: Simulation Active", "active");
    appendLog("Simulation started.");

    state.simulationTimerId = window.setInterval(() => {
      if (!state.simulationActive) return;
      if (state.simulationIndex >= state.simulationPoints.length) {
        stopSimulation();
        appendLog("Simulation finished.");
        return;
      }

      const point = state.simulationPoints[state.simulationIndex];
      state.simulationIndex += 1;
      state.latestRaw = point;
      processIncomingPoint(point, true);
    }, 1000);
  }

  function stopSimulation(showSummary = true) {
    if (state.simulationTimerId !== null) {
      clearInterval(state.simulationTimerId);
      state.simulationTimerId = null;
    }

    if (!state.simulationActive) {
      appendLog("Simulation already stopped.");
      return;
    }

    state.simulationActive = false;
    state.endTime = new Date().toISOString();
    persistState();
    renderAll();
    showStatus("Status: Simulation Stopped", "stopped");
    appendLog("Simulation stopped.");

    if (showSummary) {
      showSessionSummary("Simulation");
    }
  }

  function generateSimulationPoints() {
    const baseLat = 3.5952;
    const baseLng = 98.6722;
    const points = [];
    let currentTime = Date.now();

    for (let i = 0; i < 34; i += 1) {
      const moveLat = baseLat + i * 0.00006;
      const moveLng = baseLng + i * 0.00005;
      const jitterLat = (i % 4 === 0 ? 0.000003 : 0);
      const jitterLng = (i % 6 === 0 ? -0.000002 : 0);
      const isTooClose = i % 7 === 0 && i !== 0;
      const poorAccuracy = i % 9 === 0 && i !== 0;
      const tooFast = i % 10 === 0 && i !== 0;

      const lat = isTooClose ? moveLat - 0.00001 : moveLat + jitterLat;
      const lng = isTooClose ? moveLng - 0.00001 : moveLng + jitterLng;
      const accuracy = poorAccuracy ? 80 : 8 + (i % 5) * 4;

      currentTime += tooFast ? 1000 : 3200;
      const speedMs = 1.2 + (i % 6) * 0.35;

      points.push({
        lat,
        lng,
        accuracy,
        altitude: 18 + (i % 4),
        speed: speedMs,
        heading: (35 + i * 7) % 360,
        timestamp: new Date(currentTime).toISOString()
      });
    }
    return points;
  }

  function centerMap() {
    if (currentMarker) {
      map.setView(currentMarker.getLatLng(), Math.max(map.getZoom(), 16));
      appendLog("Map centered on current position.");
      return;
    }

    if (state.path.length > 0) {
      const last = state.path[state.path.length - 1];
      map.setView([last.lat, last.lng], Math.max(map.getZoom(), 16));
      appendLog("Map centered on latest path point.");
      return;
    }

    map.setView([CONFIG.defaultCenter.lat, CONFIG.defaultCenter.lng], 15);
    appendLog("Map centered on default location (Medan).");
  }

  function resetPath() {
    const ok = window.confirm("Delete all GPS path data from map and LocalStorage?");
    if (!ok) {
      appendLog("Reset canceled.");
      return;
    }

    if (state.trackingActive) stopTracking(false);
    if (state.simulationActive) stopSimulation(false);

    state.path = [];
    state.totalDistance = 0;
    state.ignoredPoints = 0;
    state.lastIgnoredReason = "-";
    state.startTime = null;
    state.endTime = null;
    state.lastUpdate = new Date().toISOString();
    state.latestRaw = null;

    if (currentMarker) {
      map.removeLayer(currentMarker);
      currentMarker = null;
    }

    pathLine.setLatLngs([]);
    if (startMarker) {
      map.removeLayer(startMarker);
      startMarker = null;
    }
    if (endMarker) {
      map.removeLayer(endMarker);
      endMarker = null;
    }

    localStorage.removeItem(CONFIG.storageKey);
    renderAll();
    appendLog("Data reset complete.");
    showStatus("Status: Data Reset", "neutral");
  }

  function persistState() {
    const payload = {
      path: state.path,
      metadata: {
        startTime: state.startTime,
        endTime: state.endTime,
        totalDistance: state.totalDistance,
        ignoredPoints: state.ignoredPoints,
        lastIgnoredReason: state.lastIgnoredReason,
        lastUpdate: state.lastUpdate
      }
    };
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(payload));
  }

  function loadFromLocalStorage() {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.path)) return;

      const validated = validateImportedPath(parsed.path);
      state.path = validated.path;
      state.totalDistance = Number(parsed?.metadata?.totalDistance);
      if (!isFiniteNumber(state.totalDistance)) state.totalDistance = validated.totalDistance;
      state.startTime = parsed?.metadata?.startTime || validated.startTime;
      state.endTime = parsed?.metadata?.endTime || validated.endTime;
      state.ignoredPoints = Number(parsed?.metadata?.ignoredPoints) || 0;
      state.lastIgnoredReason = parsed?.metadata?.lastIgnoredReason || "-";
      state.lastUpdate = parsed?.metadata?.lastUpdate || null;
      state.latestRaw = state.path[state.path.length - 1] || null;

      if (state.latestRaw) updateCurrentMarker(state.latestRaw, false);
      appendLog("Last local session restored from LocalStorage.");
    } catch (err) {
      appendLog(`Failed to restore LocalStorage data: ${err.message}`);
    }
  }

  function appendLog(message) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${formatLocalDateTime(new Date().toISOString())}</strong> — ${escapeHtml(message)}`;
    ui.activityLog.prepend(li);
    while (ui.activityLog.children.length > 60) {
      ui.activityLog.removeChild(ui.activityLog.lastChild);
    }
  }

  function showStatus(text, mode) {
    const normalized = String(text || "").replace(/^Status:\s*/i, "").trim();
    ui.globalStatus.textContent = `System Status: ${normalized || "Standby"}`;
    ui.globalStatus.classList.remove("neutral", "active", "stopped");
    ui.globalStatus.classList.add(mode);
  }

  function formatMeters(v) {
    if (!isFiniteNumber(v)) return "-";
    return `${v.toFixed(2)} m`;
  }

  function formatSpeed(v) {
    if (!isFiniteNumber(v)) return "-";
    return `${(v * 3.6).toFixed(2)} km/h`;
  }

  function formatNullable(v, suffix = "") {
    if (!isFiniteNumber(v)) return "-";
    return suffix ? `${v.toFixed(2)} ${suffix}` : `${v.toFixed(2)}`;
  }

  function toFiniteOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function isFiniteNumber(v) {
    return Number.isFinite(Number(v));
  }

  function formatLocalDateTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("en-US", { hour12: false });
  }

  function formatFileDate(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}-${hh}-${mi}-${ss}`;
  }

  function showSessionSummary(modeLabel) {
    if (!ui.sessionSummaryModal) return;

    const durationMs = getTrackingDurationMs();
    const distanceKm = state.totalDistance / 1000;
    const hasTripData = state.path.length > 0 || state.totalDistance > 0 || state.ignoredPoints > 0;
    if (!hasTripData) return;

    const avgSpeedKmh = durationMs > 0 ? (state.totalDistance / (durationMs / 1000)) * 3.6 : 0;
    const maxSpeedKmh = getMaxSpeedKmh();

    ui.sessionMode.textContent = modeLabel;
    ui.sessionDistanceKm.textContent = `${distanceKm.toFixed(3)} km`;
    ui.sessionDuration.textContent = formatDurationMs(durationMs);
    ui.sessionAvgSpeed.textContent = `${avgSpeedKmh.toFixed(2)} km/h`;
    ui.sessionMaxSpeed.textContent = `${maxSpeedKmh.toFixed(2)} km/h`;
    ui.sessionPoints.textContent = String(state.path.length);
    ui.sessionIgnored.textContent = String(state.ignoredPoints);
    ui.sessionStart.textContent = state.startTime ? formatLocalDateTime(state.startTime) : "-";
    ui.sessionEnd.textContent = state.endTime ? formatLocalDateTime(state.endTime) : formatLocalDateTime(new Date().toISOString());

    ui.sessionSummaryModal.classList.add("open");
    ui.sessionSummaryModal.setAttribute("aria-hidden", "false");
  }

  function hideSessionSummary() {
    if (!ui.sessionSummaryModal) return;
    ui.sessionSummaryModal.classList.remove("open");
    ui.sessionSummaryModal.setAttribute("aria-hidden", "true");
  }

  function getMaxSpeedKmh() {
    let maxKmh = 0;
    for (let i = 0; i < state.path.length; i += 1) {
      const p = state.path[i];
      if (!p || !isFiniteNumber(p.speed)) continue;
      const kmh = Number(p.speed) * 3.6;
      if (Number.isFinite(kmh) && kmh > maxKmh) {
        maxKmh = kmh;
      }
    }
    return maxKmh;
  }

  function headingToCompass(deg) {
    const normalized = ((deg % 360) + 360) % 360;
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const idx = Math.round(normalized / 45) % 8;
    return dirs[idx];
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  init();
})();

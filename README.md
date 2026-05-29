# Realtime Navigation with Incremental GPS Path Logging and Interactive Web Visualization

A complete, static web app for realtime GPS tracking with an incremental path logging algorithm, interactive map rendering, local-only storage, and JSON export/import.

Built with:

- HTML
- CSS
- Vanilla JavaScript
- Leaflet.js
- OpenStreetMap
- LocalStorage

No backend. No database. No Node.js. No framework. No paid API key.

---

## Why this app

This app is designed for:

- research demos
- thesis/final project prototypes
- field tracking experiments
- privacy-first personal tracking

Each user runs the app in their own browser and only sees their own data.

---

## Core Features

1. **Realtime GPS Tracking**
   - Uses `navigator.geolocation.watchPosition()`
   - Captures:
     - latitude
     - longitude
     - accuracy
     - altitude (if available)
     - speed (if available)
     - heading (if available)
     - timestamp
   - Live position marker updates on map
   - Map auto-follows latest position
   - Proper status handling for:
     - GPS not active
     - permission denied
     - unsupported browser

2. **Incremental GPS Path Logging Algorithm**
   - First point saved if accuracy valid
   - Next points saved only when:
     - distance from previous saved point >= 5 meters
     - time interval from previous saved point >= 3 seconds
     - accuracy <= 50 meters
   - Rejected points are counted and reason is shown
   - Computes:
     - `distanceFromPrevious`
     - `totalDistance`

3. **Interactive Web Visualization**
   - Leaflet + OpenStreetMap tiles
   - Responsive full-size map
   - Current marker, start marker, end marker
   - Live polyline path
   - Marker popup data:
     - lat/lng
     - accuracy
     - timestamp
     - distance from previous point

4. **Modern Dashboard**
   - Tracking status
   - Latest coordinates
   - GPS accuracy
   - Altitude
   - Speed
   - Total saved points
   - Total distance (m and km)
   - Tracking duration
   - Average speed
   - Last update time
   - Ignored points count
   - Last ignored reason

5. **Controls**
   - Start Tracking
   - Stop Tracking
   - Reset Path
   - Export JSON
   - Import JSON
   - Load Sample Data
   - Simulate GPS
   - Stop Simulation
   - Center Map

6. **GPS Simulation**
   - Medan default coordinate zone
   - 30+ generated points
   - Gradual movement
   - Accuracy variations
   - Includes points intentionally rejected:
     - too close
     - poor accuracy
     - too fast interval
   - Uses same incremental logging pipeline as realtime mode

7. **Export / Import JSON**
   - Export filename format:
     - `gps-path-log-yyyy-mm-dd-hh-mm-ss.json`
   - Import JSON validation
   - Invalid format -> clear error log
   - Valid import -> map and dashboard update

8. **LocalStorage Persistence**
   - Auto-save path + metadata:
     - startTime
     - endTime
     - totalDistance
     - ignoredPoints
   - Auto-restore on page reload
   - Reset clears map + LocalStorage with confirmation

9. **Privacy-first by design**
   - GPS processing in browser only
   - No data sent to server
   - No login
   - No hidden telemetry

---

## Incremental GPS Path Logging Algorithm

### Rules

Given incoming GPS point `P` and previous saved point `S`:

1. If `P.accuracy > 50` -> reject (poor accuracy)
2. If no saved point yet and accuracy valid -> save first point
3. Compute `dt = timestamp(P) - timestamp(S)`
   - if `dt < 3000 ms` -> reject (too fast)
4. Compute distance `d = Haversine(S, P)`
   - if `d < 5 m` -> reject (too close)
5. Save point with:
   - `distanceFromPrevious = d`
6. Add `d` into `totalDistance`

### Haversine Formula

For two coordinates `(lat1, lon1)` and `(lat2, lon2)`:

- `R = 6371000` meters
- `dLat = toRad(lat2 - lat1)`
- `dLon = toRad(lon2 - lon1)`
- `a = sin²(dLat/2) + cos(lat1) * cos(lat2) * sin²(dLon/2)`
- `c = 2 * atan2(sqrt(a), sqrt(1-a))`
- `distance = R * c`

---

## Data Format

```json
[
  {
    "lat": 3.5952,
    "lng": 98.6722,
    "accuracy": 12,
    "altitude": null,
    "speed": null,
    "heading": null,
    "timestamp": "2026-05-29T10:00:00.000Z",
    "distanceFromPrevious": 0
  }
]
```

---

## File Structure

```txt
gps-navigation-app/
├── index.html
├── style.css
├── app.js
├── sample-path.json
└── README.md
```

---

## Run Locally

### Quick open
1. Download/extract project
2. Open `index.html` in modern browser

### Better local test (recommended for geolocation)
Serve with local static server or localhost so Geolocation behaves consistently in secure context.

Note:
- `file://` may work for UI and JSON sample load behavior can vary by browser.
- Realtime GPS generally requires HTTPS or localhost.

---

## Deploy to GitHub Pages

1. Create GitHub repo
2. Push all files to branch `main`
3. Go to **Settings -> Pages**
4. Source: **Deploy from branch**
5. Branch: `main` / root
6. Save
7. Open generated HTTPS URL

Geolocation works because GitHub Pages is HTTPS.

---

## Deploy to Netlify

1. Login to Netlify
2. **Add new site -> Deploy manually**
3. Drag and drop project folder (or connect Git repo)
4. Publish
5. Open generated HTTPS URL

No build command required.

---

## Deploy to Vercel

1. Login to Vercel
2. **Add New Project**
3. Import Git repo (or upload static files)
4. Framework preset: **Other**
5. Build command: none
6. Output directory: root
7. Deploy

No backend config needed.

---

## How to Use

1. Open app on HTTPS or localhost
2. Click **Start Tracking**
3. Grant location permission
4. Walk/move or run **Simulate GPS**
5. Observe map, path, markers, and dashboard updates
6. Click **Stop Tracking** to end
7. Export JSON if needed
8. Import previous JSON to restore path
9. Click **Reset Path** to clear local data

---

## Export / Import Notes

### Export
- Exports saved path points only
- Timestamped filename
- JSON format ready for analysis or re-import

### Import
- Must be JSON array of path objects
- Required fields validated (`lat`, `lng`, `accuracy`, `timestamp`)
- Invalid file rejected with clear log message

---

## Privacy Notes

- GPS never sent to remote server
- No user account
- No cloud database
- No analytics tracker
- LocalStorage can be deleted anytime with **Reset Path**

---

## HTTPS Requirement

For realtime browser Geolocation:

- ✅ HTTPS domain (GitHub Pages / Netlify / Vercel)
- ✅ localhost
- ⚠️ plain HTTP usually blocked

---

## Future Improvements

- GPX/CSV export option
- Multiple trip sessions and history list
- Path smoothing toggle
- Elevation profile chart
- Offline tile cache (PWA mode)
- Manual waypoint annotations
- Speed/acceleration analytics panel

# incremental-gps-path-logger

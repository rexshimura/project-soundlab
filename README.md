# SoundLab Studio

An ultra-clean, minimalist, single-file multitrack audio workstation built with **React**, **Tailwind CSS**, and the **Web Audio API**. Designed with a brutalist, sharp black-and-gray slate theme, it provides precision recording, staging, and granular mixing capabilities straight from the browser.

---

## Aesthetic & Core Design
* **Achromatic Theme:** Pure dark mode constructed entirely using customs levels of black, zinc, and white highlights. All high-vibrancy colored buttons have been stripped for a premium matte appearance.
* **Brutalist Geometry:** Sharp edges across the entire ecosystem. No curved corners (`rounded-none`) are present on track elements, sliders, buttons, or modals.
* **Precision Waveforms:** Monochromatic white-to-gray dynamic wave profiles that react fluidly as elements scale.

---

## Key Features

### 1. Sandbox Capture Bay & Staging
* **Icon-Only Mic Control:** Tap the compact microphone icon to capture real-time stream channeling via your hardware microphone.
* **Staging Conflict Overlay:** Prevent accidental overwrites with an automated, inline notification alert accompanied by a 5-second horizontal depletion timer bar.
* **Pre-delay Countdown Engine:** Cycle sequentially through a pre-delay timer (`0s (None) ➜ 1s ➜ 3s ➜ 5s`) to track down an armed sequence. Features a large, centered micro-animated workspace countdown overlay.
* **Staging Solo Preview:** Dedicated white line playhead tracks precisely across your sandbox profile inside the active staging bar in real-time.

### 2. Multi-Lane Workspace Timeline
* **Single Segment Lock (Collision Prevention):** Track drops are restricted to one audio segment block per lane to prevent segments from stacking or overwriting layout data.
* **Dynamic Track Appending:** Initialize a session with 2 default track lanes and scale fluidly using the minimal `+ Add Audio Track Lane` row trigger.
* **Row Selection & Row Purging:** Double-clicking any row lane header brings up its distinct properties in the side adjustments panel, allowing you to delete the entire track lane alongside its child components. 

### 3. Granular Audio Processing Matrix
* **Volume Control:** Independent mixing sliders mapping values from `0%` up to `150%` headroom with dynamic layout feedback rendering on the card segment (`V: 100%`).
* **Time-Stretching Speed:** Granular speed modification slider (`0.5x - 2.0x`) that physically contracts or stretches the horizontal width of your card segments on the grid timeline.
* **Pitch Shifting:** Varispeed tape-rate simulation mapping pitch frequencies (`0.5x - 2.0x`) from low to high.
* **Harmonic Distortion FX:** Custom `WaveShaperNode` injection processing allowing you to add digital fuzz and saturation saturation scaling up to `100%`. Staged segments render a `DST` badge automatically.

### 4. Interactive Transport System
* **Drag-Only Global Playhead:** The global vertical line playhead is locked to standard coordinates and explicitly responds *only* to pulling and dragging actions. Click-to-jump canvas triggers are blocked.
* **Boundary Play Guard:** If an audio card is selected during global project playback, the tracking engine triggers a safety stop the exact millisecond the playhead hits the selected segment's trailing edge.
* **Contextual Drag-to-Trash Dropzone:** Dragging any card contextually transforms the Sandbox *Solo Preview* layout module into a high-visibility, dark-red trash landing array. Dropping the clip here deletes it instantly.
* **Floating Session Exporter:** Click the flat circle button sitting fixed in the top-right corner to open a clean overlay dialog modal, set a custom file name, and download your local `.mp3` output bundle cleanly.

---

## Global Controls & Keyboard Shortcuts

| Control Target | Input Source | Action Description |
| :--- | :--- | :--- |
| **Grid Repositioning** | `Select Card` + `Left Arrow ( ← )` | Nudges sound card horizontally left by `-0.1s`. |
| **Grid Repositioning** | `Select Card` + `Right Arrow ( → )` | Nudges sound card horizontally right by `+0.1s`. |
| **Nudge Acceleration** | Hold `←` or `→` Arrow Key | Fluidly shifts chronological offsets faster using key-repeat cycles. |
| **Deselect Active State** | Click empty canvas background | Instantly clears card selection highlights and resets side inspectors. |
| **Row Properties** | `Double Click` Track Lane Header | Opens the lane management sidebar panel to isolate/delete the row. |

---

## Installation & Usage

1. Copy the code into your React application directory (e.g., `src/App.jsx`).
2. Ensure you have your project layout configured with **Tailwind CSS** and **Lucide React**:
   ```bash
   npm install lucide-react
   ```

3. Add the custom Tailwind keyframe animation into your workspace configurations if you plan to style it externally:
   ```bash
   // tailwind.config.js
    module.exports = {
    theme: {
        extend: {
        animation: {
            'shrink-timer': 'shrinkTimer 5s linear forwards',
        }
        },
    },
    }
    ```
4. Running the Development Server
If you are using Vite, spin up your local tracking environment by running:

```bash
npm run dev
```

## Browser Compatibility

For the best experience, use a modern desktop browser with support for:

Web Audio API
AudioBufferSourceNode
WaveShaperNode
MediaRecorder
getUserMedia()
Microphone capture

Chromium-based browsers such as Google Chrome and Microsoft Edge are recommended.
---
SoundLab Studio combines a minimalist brutalist interface with browser-native audio processing. Which is a lightweight, experimental multitrack audio workstation that runs directly inside the browser
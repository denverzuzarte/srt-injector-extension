// SRT parser: converts SRT text to array of {start, end, text}
function parseSRT(srt) {
  const cues = [];
  const blocks = srt.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;
    // First line is index (skip), second is timecode
    const timeLine = lines.find(l => l.includes('-->'));
    if (!timeLine) continue;
    const match = timeLine.match(
      /(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/
    );
    if (!match) continue;
    const toSec = (h, m, s, ms) => +h * 3600 + +m * 60 + +s + +ms / 1000;
    const start = toSec(match[1], match[2], match[3], match[4]);
    const end   = toSec(match[5], match[6], match[7], match[8]);
    const textStart = lines.indexOf(timeLine) + 1;
    const text = lines.slice(textStart).join('\n').replace(/<[^>]+>/g, '').trim();
    if (text) cues.push({ start, end, text });
  }
  return cues;
}

// State
let selectMode = false;
let overlay = null;         // the subtitle overlay div
let cues = [];
let activeVideo = null;
let rafId = null;
let highlightedVideo = null;
let highlightBox = null;

// ── Subtitle rendering ────────────────────────────────────────────────────────

function createOverlay() {
  removeOverlay();
  overlay = document.createElement('div');
  overlay.id = '__srt_overlay__';
  // position:fixed on document.body — never touches the video's DOM parents,
  // so Chromium's hardware-accelerated video layer stays intact (no black screen).
  // Exact coordinates are set every frame in renderLoop() via getBoundingClientRect().
  Object.assign(overlay.style, {
    position:      'fixed',
    pointerEvents: 'none',
    zIndex:        '2147483647',
    textAlign:     'center',
    lineHeight:    '1.4',
    boxSizing:     'border-box',
  });
  document.body.appendChild(overlay);
  return overlay;
}

function positionOverlay(video) {
  if (!overlay) return;
  const r = video.getBoundingClientRect();
  // Font scales with video width; clamp between 14 px and 32 px
  const fs = Math.min(32, Math.max(14, r.width * 0.035));
  Object.assign(overlay.style, {
    left:     r.left + 'px',
    width:    r.width + 'px',
    // bottom: 8% of the video height up from the video's bottom edge
    bottom:   (window.innerHeight - r.bottom + r.height * 0.08) + 'px',
    padding:  '0 ' + (r.width * 0.04) + 'px',
    fontSize: fs + 'px',
  });
}

function removeOverlay() {
  if (overlay) { overlay.remove(); overlay = null; }
  if (rafId)   { cancelAnimationFrame(rafId); rafId = null; }
}

function renderLoop() {
  if (!activeVideo || !overlay) return;

  // Re-position every frame so it tracks the video through scroll / resize
  positionOverlay(activeVideo);

  const t = activeVideo.currentTime;
  const active = cues.filter(c => t >= c.start && t <= c.end);
  if (active.length) {
    overlay.innerHTML = active.map(c =>
      `<span style="
        background:rgba(0,0,0,0.72);
        color:#fff;
        padding:2px 8px;
        border-radius:3px;
        display:inline-block;
        margin:2px 0;
        white-space:pre-wrap;
        text-shadow:0 1px 2px #000;
      ">${c.text}</span>`
    ).join('<br>');
  } else {
    overlay.innerHTML = '';
  }
  rafId = requestAnimationFrame(renderLoop);
}

function attachSubtitles(video, srtText) {
  cues = parseSRT(srtText);
  activeVideo = video;
  createOverlay();
  rafId = requestAnimationFrame(renderLoop);

  // Notify popup
  window.postMessage({ type: '__SRT_ATTACHED__', count: cues.length }, '*');
}

// ── Video selection mode ──────────────────────────────────────────────────────

function getAllVideos() {
  return Array.from(document.querySelectorAll('video'));
}

function highlightVideo(video) {
  if (highlightedVideo === video) return;
  clearHighlight();
  highlightedVideo = video;

  const rect = video.getBoundingClientRect();
  highlightBox = document.createElement('div');
  Object.assign(highlightBox.style, {
    position:     'fixed',
    top:          rect.top + 'px',
    left:         rect.left + 'px',
    width:        rect.width + 'px',
    height:       rect.height + 'px',
    border:       '3px solid #00cfff',
    borderRadius: '4px',
    boxSizing:    'border-box',
    pointerEvents:'none',
    zIndex:       '2147483646',
    background:   'rgba(0,207,255,0.08)',
    transition:   'all 0.1s',
  });

  // Label
  const label = document.createElement('div');
  Object.assign(label.style, {
    position:   'absolute',
    top:        '6px',
    left:       '6px',
    background: '#00cfff',
    color:      '#000',
    fontSize:   '12px',
    fontWeight: 'bold',
    padding:    '2px 8px',
    borderRadius:'3px',
    fontFamily: 'sans-serif',
  });
  label.textContent = 'Click to attach subtitles';
  highlightBox.appendChild(label);
  document.body.appendChild(highlightBox);
}

function clearHighlight() {
  if (highlightBox) { highlightBox.remove(); highlightBox = null; }
  highlightedVideo = null;
}

function startSelectMode() {
  // Always clean up first so listeners never stack on repeated use
  stopSelectMode();
  selectMode = true;
  document.body.style.cursor = 'crosshair';
  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('click',     onVideoClick,  true);
  document.addEventListener('keydown',   onEscape,      true);
}

function stopSelectMode() {
  selectMode = false;
  document.body.style.cursor = '';
  document.removeEventListener('mouseover', onMouseOver, true);
  document.removeEventListener('click',     onVideoClick,  true);
  document.removeEventListener('keydown',   onEscape,      true);
  clearHighlight();
}

function onMouseOver(e) {
  const video = e.target.closest('video');
  if (video) {
    e.stopPropagation();
    highlightVideo(video);
  } else {
    clearHighlight();
  }
}

function onVideoClick(e) {
  // Try direct DOM ancestry first
  let video = e.target.closest('video');

  // Fallback: many players put a transparent overlay div on top of <video>,
  // so e.target won't be the video — check if the click coords land inside one.
  if (!video) {
    const videos = getAllVideos();
    for (const v of videos) {
      const r = v.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right &&
          e.clientY >= r.top  && e.clientY <= r.bottom) {
        video = v;
        break;
      }
    }
  }

  if (!video) return;
  e.preventDefault();
  e.stopPropagation();
  stopSelectMode();
  const videos = getAllVideos();
  const idx = videos.indexOf(video);
  chrome.storage.local.set({ srt_event: { type: 'VIDEO_SELECTED', index: idx } });
}

function onEscape(e) {
  if (e.key === 'Escape') {
    stopSelectMode();
    chrome.storage.local.set({ srt_event: { type: 'CANCELLED' } });
  }
}

// ── Message bridge (popup <-> content) ───────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'START_SELECT') {
    const videos = getAllVideos();
    if (videos.length === 0) {
      sendResponse({ ok: false, reason: 'No <video> elements found on this page.' });
      return;
    }
    startSelectMode();
    sendResponse({ ok: true, count: videos.length });
  }

  if (msg.type === 'ATTACH_SRT') {
    const videos = getAllVideos();
    const video = videos[msg.index];
    if (!video) { sendResponse({ ok: false }); return; }
    attachSubtitles(video, msg.srt);
    sendResponse({ ok: true, cues: cues.length });
  }

  if (msg.type === 'DETACH') {
    removeOverlay();
    activeVideo = null;
    cues = [];
    sendResponse({ ok: true });
  }

  if (msg.type === 'STATUS') {
    sendResponse({ active: !!activeVideo, cues: cues.length });
  }
});

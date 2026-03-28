const btnSelect  = document.getElementById('btnSelect');
const btnDetach  = document.getElementById('btnDetach');
const btnLoad    = document.getElementById('btnLoad');
const statusEl   = document.getElementById('status');

let pollInterval      = null;   // only ever one at a time
let pendingVideoIndex = null;

function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + type;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToContent(msg) {
  const tab = await getActiveTab();
  return chrome.tabs.sendMessage(tab.id, msg);
}

function stopPolling() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

// ── 1. User clicks "target video" ────────────────────────────────────────────
btnSelect.addEventListener('click', async () => {
  stopPolling(); // kill any previous poll before starting a new one
  pendingVideoIndex = null;
  btnLoad.hidden = true;
  btnSelect.disabled = true;
  setStatus('Click on any video on the page...', 'warn');

  // Clear any stale event or pending index from a previous run
  await chrome.storage.local.remove(['srt_event', 'srt_pending_index']);

  let res;
  try {
    res = await sendToContent({ type: 'START_SELECT' });
  } catch (e) {
    setStatus('Could not reach page. Try refreshing.', 'err');
    btnSelect.disabled = false;
    return;
  }

  if (!res.ok) {
    setStatus('Warning: ' + res.reason, 'err');
    btnSelect.disabled = false;
    return;
  }

  setStatus(`Found ${res.count} video(s). Click the one you want. (Esc to cancel)`, 'warn');

  const started = Date.now();
  pollInterval = setInterval(async () => {
    if (Date.now() - started > 30000) {
      stopPolling();
      btnSelect.disabled = false;
      setStatus('Timed out. Try again.', '');
      return;
    }

    const data = await chrome.storage.local.get('srt_event');
    if (!data.srt_event) return;

    const evt = data.srt_event;
    await chrome.storage.local.remove('srt_event');
    stopPolling();

    if (evt.type === 'VIDEO_SELECTED') {
      pendingVideoIndex = evt.index;
      // Persist index so it survives a popup close/reopen (e.g. when file picker opens)
      await chrome.storage.local.set({ srt_pending_index: evt.index });
      btnLoad.hidden = false;
      setStatus('Video selected! Now click "Load SRT file" below.', 'ok');
      btnSelect.disabled = false;
    } else if (evt.type === 'CANCELLED') {
      setStatus('Selection cancelled.', '');
      btnSelect.disabled = false;
    }
  }, 200);
});

// ── 2. "Load SRT file" button ─────────────────────────────────────────────────
// Opens filepicker.html in a separate full window — showOpenFilePicker() crashes
// the renderer when called directly from an extension popup context (Chromium bug).
// filepicker.js does the actual picking and writes the result to chrome.storage.local.
btnLoad.addEventListener('click', async () => {
  const tab = await getActiveTab();

  // Tell filepicker.js which tab and video index to target
  await chrome.storage.local.set({ srt_target_tab_id: tab.id });
  await chrome.storage.local.remove('srt_result');

  chrome.windows.create({
    url:    chrome.runtime.getURL('filepicker.html'),
    type:   'popup',
    width:  400,
    height: 160,
  });

  setStatus('Choose your SRT file in the window that just opened…', 'warn');

  // Poll for the result that filepicker.js will write on completion
  const started = Date.now();
  const resultPoll = setInterval(async () => {
    // Give the user up to 2 minutes to pick a file
    if (Date.now() - started > 120000) {
      clearInterval(resultPoll);
      setStatus('Video selected! Now click "Load SRT file" below.', 'ok');
      return;
    }

    const data = await chrome.storage.local.get('srt_result');
    if (!data.srt_result) return;

    clearInterval(resultPoll);
    const result = data.srt_result;
    await chrome.storage.local.remove(['srt_result', 'srt_pending_index', 'srt_target_tab_id']);
    pendingVideoIndex = null;

    if (result.ok) {
      btnLoad.hidden = true;
      setStatus(`Done: ${result.cues} cue(s) loaded from "${result.filename}"`, 'ok');
      btnDetach.disabled = false;
    } else {
      setStatus('Failed — video may have disappeared. Try again.', 'err');
      btnLoad.hidden = false;
    }
  }, 200);
});

// ── 3. Detach ─────────────────────────────────────────────────────────────────
btnDetach.addEventListener('click', async () => {
  await sendToContent({ type: 'DETACH' });
  btnDetach.disabled = true;
  btnLoad.hidden = true;
  pendingVideoIndex = null;
  await chrome.storage.local.remove(['srt_event', 'srt_pending_index', 'srt_target_tab_id', 'srt_result']);
  setStatus('Subtitles removed.', '');
});

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  // Restore state from a previous popup open — DON'T blindly clear storage here,
  // because the popup closes on focus loss, so the video-click storage write
  // may have happened while the popup was closed.
  const stored = await chrome.storage.local.get(['srt_event', 'srt_pending_index']);

  if (stored.srt_event?.type === 'VIDEO_SELECTED') {
    // Content script wrote the selection while popup was closed — restore it
    pendingVideoIndex = stored.srt_event.index;
    await chrome.storage.local.set({ srt_pending_index: pendingVideoIndex });
    await chrome.storage.local.remove('srt_event');
    btnLoad.hidden = false;
    setStatus('Video selected! Now click "Load SRT file" below.', 'ok');
  } else if (stored.srt_pending_index != null) {
    // File picker was open when popup last closed — restore pending index
    pendingVideoIndex = stored.srt_pending_index;
    btnLoad.hidden = false;
    setStatus('Video selected! Now click "Load SRT file" below.', 'ok');
  } else {
    await chrome.storage.local.remove('srt_event');
  }

  try {
    const res = await sendToContent({ type: 'STATUS' });
    if (res && res.active) {
      if (pendingVideoIndex === null) {
        setStatus(`Active: ${res.cues} cue(s) on this page.`, 'ok');
      }
      btnDetach.disabled = false;
    }
  } catch (_) {}
})();

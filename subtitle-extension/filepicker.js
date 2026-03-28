// Runs in a full browser window (not a popup), so showOpenFilePicker()
// works without crashing the renderer.
//
// Flow:
//  1. Read srt_pending_index + srt_target_tab_id from storage (written by popup.js).
//  2. User clicks "Choose SRT file" → showOpenFilePicker() → read text.
//  3. Send ATTACH_SRT to the content script on the target tab.
//  4. Write srt_result to storage so popup.js can update its UI.
//  5. window.close().

const btn = document.getElementById('btnPick');
const msg = document.getElementById('msg');

(async () => {
  const { srt_pending_index, srt_target_tab_id } =
    await chrome.storage.local.get(['srt_pending_index', 'srt_target_tab_id']);

  if (srt_pending_index == null || srt_target_tab_id == null) {
    msg.textContent = 'Error: no video selected. Close this and try again.';
    btn.disabled = true;
    return;
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true;

    // ── 1. Pick file ─────────────────────────────────────────────────────────
    let file;
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'SubRip Subtitles', accept: { 'text/plain': ['.srt'] } }],
        multiple: false,
      });
      file = await handle.getFile();
    } catch (e) {
      if (e.name === 'AbortError') {
        // User cancelled — just re-enable the button
        btn.disabled = false;
        return;
      }
      msg.textContent = 'Could not open file picker.';
      btn.disabled = false;
      return;
    }

    msg.textContent = 'Loading…';
    const srt = await file.text();

    // ── 2. Send to content script ─────────────────────────────────────────────
    let response;
    try {
      response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(
          srt_target_tab_id,
          { type: 'ATTACH_SRT', index: srt_pending_index, srt },
          res => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError.message);
            } else {
              resolve(res);
            }
          }
        );
      });
    } catch (e) {
      await chrome.storage.local.set({ srt_result: { ok: false, error: String(e) } });
      window.close();
      return;
    }

    // ── 3. Write result for popup.js to pick up ───────────────────────────────
    await chrome.storage.local.set({
      srt_result: {
        ok:       response?.ok   ?? false,
        cues:     response?.cues ?? 0,
        filename: file.name,
      },
    });
    window.close();
  });
})();

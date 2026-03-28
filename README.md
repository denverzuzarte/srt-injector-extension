# SRT Injector

A Chrome extension that lets you attach an external `.srt` subtitle file onto any `<video>` element in your browser — no server, no account, no re-encoding required.

Works on local video files, self-hosted players, and any site that uses a standard HTML `<video>` tag.

---

## Features

- Click any video on any page to target it
- Load any `.srt` file from your computer
- Subtitles render as an overlay that tracks the video through scroll and resize
- Remove subtitles instantly with one click
- Persists selection across popup close/reopen

---

## Installation

This extension is not on the Chrome Web Store — you load it directly from the source files.

**1. Download the extension**

Clone the repo or download it as a ZIP and extract it:

```bash
git clone https://github.com/denverzuzarte/srt-injector-extension.git
```

**2. Open Chrome extensions**

Go to `chrome://extensions` in your browser address bar.

**3. Enable Developer Mode**

Toggle **Developer mode** on in the top-right corner.

![Developer mode toggle](https://developer.chrome.com/static/docs/extensions/get-started/tutorial/hello-world/image/extensions-page-e0d64d89a6acf_856.png)

**4. Load the extension**

Click **Load unpacked** and select the `subtitle-extension` folder inside the repo:

```
srt-injector-extension/
└── subtitle-extension/   ← select this folder
```

The SRT Injector icon will appear in your toolbar.

---

## How to use

**1. Open your video**

Navigate to a page with a `<video>` element, or open a local video file directly in Chrome:

```
File → Open File… → select your .mp4
```

**2. Target the video**

Click the SRT Injector icon in the toolbar, then click **Click a video to target**.

Your cursor changes to a crosshair. Hover over the video — it highlights blue — then click it.

> The popup will close when you move onto the page. Reopen it — it will show **"Video selected!"** automatically.

**3. Load your SRT file**

Click **Load SRT file**. A small file picker window opens (separate from the popup to avoid a known Chromium bug with file pickers in extension popups).

Click **Choose SRT file**, pick your `.srt` file, and the window closes on its own.

**4. Watch**

Subtitles appear over the video, synced to playback. They stay in position through scroll and resize.

**5. Remove subtitles**

Click the SRT Injector icon and click **✕ Remove subtitles**.

---

## Supported formats

Standard `.srt` files with timecodes in either of these formats:

```
00:02:07,680 --> 00:02:10,411
Subtitle text here.
```

```
00:02:07.680 --> 00:02:10.411
Subtitle text here.
```

HTML tags inside the SRT (e.g. `<i>`, `<font color="...">`) are stripped automatically.

---

## Limitations

- Only works on pages that use a native HTML `<video>` element. Players that render inside a `<canvas>` or use DRM (Netflix, Disney+, etc.) are not supported.
- One video targeted at a time per tab.
- Subtitle state is cleared on page refresh.

---

## License

MIT

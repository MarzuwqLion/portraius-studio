# ffmpeg.wasm core

`ffmpeg-core.js` and `ffmpeg-core.wasm` from `@ffmpeg/core` 0.12.10 (single-thread build, since GitHub
Pages can't send the cross-origin isolation headers the multi-thread build needs), copied unchanged.

The core is FFmpeg compiled to WebAssembly and is licensed GPL-2.0-or-later, separately from this
MIT-licensed app, which loads it as its own program in a web worker. Source:
https://github.com/ffmpegwasm/ffmpeg.wasm (and FFmpeg itself at https://ffmpeg.org).

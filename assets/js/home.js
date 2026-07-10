/* Homepage — swap the three big videos for ones uploaded in the admin
   (settings table, keys home_video_*). Falls back to the static files
   baked into the HTML until a replacement is uploaded. */
(function () {
  if (!(window.SR && window.SR.ready)) return;
  const slots = document.querySelectorAll('video[data-home-video]');
  if (!slots.length) return;
  window.SR.getSettings().then(S => {
    slots.forEach(v => {
      const conf = S['home_video_' + v.getAttribute('data-home-video')];
      if (!conf || !conf.src) return;
      if (conf.poster) v.poster = conf.poster;
      if (v.currentSrc !== conf.src) {
        const wasPlaying = !v.paused;
        v.src = conf.src;
        v.load();                      // preload stays "none" — downloads on scroll
        if (wasPlaying) v.play().catch(() => {});
      }
    });
  }).catch(() => {});
})();

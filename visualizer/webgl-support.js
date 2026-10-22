(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.WebglSupport = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  function isWebglAvailable(doc) {
    try {
      const d = doc || document;
      const canvas = d.createElement('canvas');
      const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl');
      return !!ctx;
    } catch (e) {
      return false;
    }
  }

  // AR on this device («Поставить у себя в комнате»): 'quicklook' (iPhone,
  // iPad in Safari: Apple's AR Quick Look with a USDZ), 'safari' (iPhone,
  // iPad in another browser or an app's web view -- Chrome, Яндекс,
  // Telegram...: Quick Look opens a model made on the page only from
  // Safari, so the button opens this very product there), 'webxr'
  // (Android: Chrome's immersive-ar session) or null -- then there is no AR
  // button. Cheap checks and nothing loaded; off Android WebXR is never asked.
  const OTHER_IOS_BROWSERS = /CriOS\/|FxiOS\/|EdgiOS\/|YaBrowser\/|OPiOS\/|GSA\/|DuckDuckGo\/|Telegram/;
  function arMode(win) {
    const w = win || window;
    const nav = w.navigator || {};
    const ua = nav.userAgent || '';
    const ios = /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
    if (ios) {
      const webView = !!(w.webkit && w.webkit.messageHandlers);
      if (webView || OTHER_IOS_BROWSERS.test(ua)) return Promise.resolve('safari');
      const a = w.document.createElement('a');
      return Promise.resolve(a.relList && a.relList.supports && a.relList.supports('ar') ? 'quicklook' : null);
    }
    if (/android/i.test(ua) && nav.xr && nav.xr.isSessionSupported) {
      return nav.xr.isSessionSupported('immersive-ar').then(ok => (ok ? 'webxr' : null), () => null);
    }
    return Promise.resolve(null);
  }

  return { isWebglAvailable, arMode };
});

// Dynamic public path configuration for webpack
// This script will be injected at the beginning of the bundle

declare const __webpack_public_path__: string;

(function() {
  // Try to determine the public path from the current script location
  if (typeof __webpack_public_path__ === 'undefined' || __webpack_public_path__ === '') {
    try {
      // Get the current script element (the bundle)
      const scripts = document.getElementsByTagName('script');
      let bundleScript: HTMLScriptElement | null = null;
      
      for (let i = scripts.length - 1; i >= 0; i--) {
        if (scripts[i].src && scripts[i].src.includes('btc-locker.bundle.js')) {
          bundleScript = scripts[i];
          break;
        }
      }
      
      if (bundleScript) {
        // Extract the directory path from the bundle script src
        const bundlePath = bundleScript.src;
        const publicPath = bundlePath.substring(0, bundlePath.lastIndexOf('/') + 1);
        (globalThis as any).__webpack_public_path__ = publicPath;
      }
    } catch (e) {
      // Fallback to empty string if anything goes wrong
      (globalThis as any).__webpack_public_path__ = '';
    }
  }
})();
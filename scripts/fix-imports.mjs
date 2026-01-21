import { readdir, readFile, writeFile } from 'fs/promises';
import { join, extname } from 'path';

async function fixImports(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      await fixImports(fullPath);
    } else if (entry.isFile() && extname(entry.name) === '.js') {
      let content = await readFile(fullPath, 'utf8');
      
      // Fix relative imports to include .js extension
      // Handle both named imports and default imports
      content = content.replace(/(from\s+['"])(\.{1,2}\/[^'"]*)(['"]\s*;?\s*$)/gm, (match, prefix, path, suffix) => {
        if (!path.includes('?') && !path.endsWith('.js') && !path.endsWith('.mjs') && !path.endsWith('.cjs')) {
          // Special handling for directory imports that need /index.js
          if (path.endsWith('/utils') || path === '../utils' || path === './utils') {
            return prefix + path + '/index.js' + suffix;
          }
          // For files that need .js extension
          return prefix + path + '.js' + suffix;
        }
        return match;
      });
      
      content = content.replace(/(import\s+[^'"\s]+[^'"]*)(['"])(\.{1,2}\/[^'"]*)(['"])/gm, (match, before, openQuote, path, closeQuote) => {
        if (!path.includes('?') && !path.endsWith('.js') && !path.endsWith('.mjs') && !path.endsWith('.cjs')) {
          // Special handling for directory imports that need /index.js
          if (path.endsWith('/utils') || path === '../utils' || path === './utils') {
            return before + openQuote + path + '/index.js' + closeQuote;
          }
          // For files that need .js extension
          return before + openQuote + path + '.js' + closeQuote;
        }
        return match;
      });
      
      await writeFile(fullPath, content);
    }
  }
}

// Fix imports in ESM build
await fixImports('./dist/esm');
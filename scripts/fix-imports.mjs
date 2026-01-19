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
      content = content.replace(/from\s+['"](\.\/[^'"]+)['"]/g, (match, path) => {
        if (!path.endsWith('.js') && !path.includes('?')) {
          return match.replace(path, path + '.js');
        }
        return match;
      });
      
      content = content.replace(/import\s+['"](\.\/[^'"]+)['"]/g, (match, path) => {
        if (!path.endsWith('.js') && !path.includes('?')) {
          return match.replace(path, path + '.js');
        }
        return match;
      });
      
      await writeFile(fullPath, content);
    }
  }
}

// Fix imports in ESM build
await fixImports('./dist/esm');
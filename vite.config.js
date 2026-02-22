import { defineConfig } from 'vite';

// Para GitHub Pages (repositório https://github.com/<user>/<repo>):
// defina VITE_BASE como '/<repo>/' no GitHub Actions ou no seu ambiente.
export default defineConfig(({ mode }) => {
  const base = process.env.VITE_BASE || '/';
  return { base };
});

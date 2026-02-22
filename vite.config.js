import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    // Em produção (Pages), o site roda em /PersonalApp/
    base: process.env.VITE_BASE || '/',
  };
});

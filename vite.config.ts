import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// GitHub Pages serves from /<repo-name>/; every other host serves from /.
const base = process.env.VITE_BASE ?? '/';

// Link previews need absolute URLs. GitHub Pages passes SITE_URL from the workflow; Vercel's own
// variables cover its deploys. Locally, the tags fall back to paths under `base`.
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
const siteUrl = (process.env.SITE_URL ?? (vercelHost ? `https://${vercelHost}` : '')).replace(
  /\/$/,
  '',
);
const pageUrl = siteUrl ? `${siteUrl}/` : base;
const asset = (file: string) => (siteUrl ? `${siteUrl}/${file}` : `${base}${file}`);

const TITLE = 'Stellar Atlas';
const DESCRIPTION =
  'Every known star within 100 light-years, mapped in true 3D. Plot routes, travel times and trade networks across the real stellar neighbourhood.';

// public/og-image.png and public/og-video.mp4 come from `npm run og`.
function socialMeta(): Plugin {
  const tags: [string, string, string][] = [
    ['name', 'description', DESCRIPTION],
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', TITLE],
    ['property', 'og:title', TITLE],
    ['property', 'og:description', DESCRIPTION],
    ['property', 'og:url', pageUrl],
    ['property', 'og:image', asset('og-image.png')],
    ['property', 'og:image:type', 'image/png'],
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '630'],
    [
      'property',
      'og:image:alt',
      'The Stellar Atlas star map, with routes drawn between nearby stars',
    ],
    ['property', 'og:video', asset('og-video.mp4')],
    ['property', 'og:video:secure_url', asset('og-video.mp4')],
    ['property', 'og:video:type', 'video/mp4'],
    ['property', 'og:video:width', '1200'],
    ['property', 'og:video:height', '630'],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', TITLE],
    ['name', 'twitter:description', DESCRIPTION],
    ['name', 'twitter:image', asset('og-image.png')],
  ];
  return {
    name: 'social-meta',
    transformIndexHtml: () =>
      tags.map(([key, value, content]) => ({
        tag: 'meta',
        attrs: { [key]: value, content },
        injectTo: 'head',
      })),
  };
}

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), socialMeta()],
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
});

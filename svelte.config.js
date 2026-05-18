import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  kit: {
    adapter: adapter({ runtime: 'nodejs22.x' })
  },
  preprocess: vitePreprocess()
};

export default config;

import { mount } from 'svelte';
import App from './App.svelte';

function mountApp(): void {
  const target = document.getElementById('app');
  if (!target) {
    throw new Error('Missing app mount node');
  }

  mount(App, { target });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountApp, { once: true });
} else {
  mountApp();
}

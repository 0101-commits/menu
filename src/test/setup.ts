import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/menu/');
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverStub {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [0];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
}

Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ResizeObserverStub });
Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: ResizeObserverStub });
Object.defineProperty(window, 'IntersectionObserver', { writable: true, value: IntersectionObserverStub });
Object.defineProperty(globalThis, 'IntersectionObserver', { writable: true, value: IntersectionObserverStub });
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }),
});

if (!globalThis.CSS) Object.defineProperty(globalThis, 'CSS', { value: {} });
if (!globalThis.CSS.escape) globalThis.CSS.escape = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');

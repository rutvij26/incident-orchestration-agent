import "@testing-library/jest-dom";
import { vi, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// ResizeObserver (needed by Radix UI)
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// PointerEvent (needed by Radix UI)
if (!global.PointerEvent) {
  class PointerEvent extends MouseEvent {
    pointerType: string;
    constructor(type: string, init?: PointerEventInit) {
      super(type, init);
      this.pointerType = init?.pointerType ?? "mouse";
    }
  }
  global.PointerEvent = PointerEvent as typeof global.PointerEvent;
}

// scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// hasPointerCapture
window.HTMLElement.prototype.hasPointerCapture = vi.fn();

// setPointerCapture
window.HTMLElement.prototype.setPointerCapture = vi.fn();

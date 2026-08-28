import {JSDOM} from "jsdom";
import {afterAll, afterEach} from "vitest";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});

Object.defineProperties(globalThis, {
  document: {configurable: true, value: dom.window.document},
  navigator: {configurable: true, value: dom.window.navigator},
  window: {configurable: true, value: dom.window},
});

for (const property of Object.getOwnPropertyNames(dom.window)) {
  if (!(property in globalThis)) {
    Object.defineProperty(globalThis, property, Object.getOwnPropertyDescriptor(dom.window, property)!);
  }
}

await import("@testing-library/jest-dom/vitest");
const {cleanup} = await import("@testing-library/react");

afterEach(() => {
  cleanup();
});

afterAll(() => {
  dom.window.close();
});

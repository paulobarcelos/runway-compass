// ABOUTME: Configures a lightweight DOM environment for Node-based tests.
// ABOUTME: Exposes window, document, and act configuration for React tests.
/* eslint-disable @typescript-eslint/no-require-imports */
const { JSDOM } = require("jsdom");

if (typeof globalThis.window === "undefined" || !globalThis.window.document) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.navigator = {
    ...dom.window.navigator,
    userAgent: "node.js",
  };
  globalThis.requestAnimationFrame =
    dom.window.requestAnimationFrame?.bind(dom.window) ??
    ((callback) => setTimeout(callback, 0));
  globalThis.cancelAnimationFrame =
    dom.window.cancelAnimationFrame?.bind(dom.window) ?? ((id) => clearTimeout(id));
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

module.exports = {};

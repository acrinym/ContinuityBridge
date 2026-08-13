import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

function explicitMessage(role, text) {
  return {
    innerText: text,
    textContent: text,
    getAttribute(name) {
      if (name === "data-testid") return `${role}-message`;
      return null;
    },
    closest(selector) {
      if (selector.includes("data-testid")) return this;
      return null;
    },
    querySelector() {
      return null;
    },
  };
}

function nestedMessage(parent, text) {
  return {
    innerText: text,
    textContent: text,
    getAttribute() {
      return null;
    },
    closest(selector) {
      if (selector.includes("data-testid")) return parent;
      return null;
    },
    querySelector() {
      return null;
    },
  };
}

async function loadExtractor(rawElements) {
  const source = await readFile(new URL("../browser-extension/popup.js", import.meta.url), "utf8");
  const controls = {
    port: { value: "43119" },
    token: { value: "test-token" },
    capture: { disabled: false, addEventListener() {} },
    status: { textContent: "" },
  };
  const context = vm.createContext({
    location: {
      hostname: "claude.ai",
      pathname: "/chat/test-conversation",
      origin: "https://claude.ai",
    },
    document: {
      title: "Repeated turns — Claude",
      getElementById(id) {
        return controls[id];
      },
      querySelectorAll() {
        return rawElements;
      },
    },
    chrome: {
      storage: {
        local: {
          get(_keys, callback) {
            callback({});
          },
          async set() {},
        },
      },
      tabs: { async query() { return []; } },
      scripting: { async executeScript() { return []; } },
    },
    fetch: async () => { throw new Error("not used by extractor test"); },
  });
  vm.runInContext(source, context, { filename: "browser-extension/popup.js" });
  return vm.runInContext("extractVisibleConversation()", context);
}

test("Claude capture preserves distinct repeated equal-text turns", async () => {
  const firstYes = explicitMessage("user", "yes");
  const assistant = explicitMessage("assistant", "Got it.");
  const secondYes = explicitMessage("user", "yes");
  const duplicateSelector = nestedMessage(assistant, "Got it.");

  const payload = await loadExtractor([firstYes, assistant, duplicateSelector, secondYes]);

  assert.equal(payload.schema, "continuity-bridge/live-capture-v1");
  assert.equal(payload.source, "claude");
  assert.deepEqual(
    Array.from(payload.conversation.messages, (message) => [message.role, message.text]),
    [
      ["user", "yes"],
      ["assistant", "Got it."],
      ["user", "yes"],
    ],
  );
});

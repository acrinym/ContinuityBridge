const portInput = document.getElementById("port");
const tokenInput = document.getElementById("token");
const captureButton = document.getElementById("capture");
const status = document.getElementById("status");

chrome.storage.local.get(["capturePort", "captureToken"], (stored) => {
  if (stored.capturePort) portInput.value = String(stored.capturePort);
  if (stored.captureToken) tokenInput.value = stored.captureToken;
});

function setStatus(text) {
  status.textContent = text;
}

async function extractVisibleConversation() {
  const hostname = location.hostname.toLowerCase();
  let source;
  let nodes = [];

  if (hostname === "chatgpt.com" || hostname.endsWith(".chatgpt.com")) {
    source = "chatgpt";
    nodes = [...document.querySelectorAll("[data-message-author-role]")]
      .map((element) => ({
        element,
        role: element.getAttribute("data-message-author-role"),
      }))
      .filter((item) => ["user", "assistant", "system"].includes(item.role));
  } else if (hostname === "claude.ai" || hostname.endsWith(".claude.ai")) {
    source = "claude";
    const raw = [
      ...document.querySelectorAll('[data-testid="user-message"], [data-testid="assistant-message"], .font-claude-message'),
    ];
    const seen = new Set();
    nodes = raw
      .map((element) => {
        const testId = element.getAttribute("data-testid") || "";
        const role = testId.includes("user") ? "user" : "assistant";
        const text = (element.innerText || element.textContent || "").trim();
        const key = `${role}\u0000${text}`;
        if (!text || seen.has(key)) return null;
        seen.add(key);
        return { element, role };
      })
      .filter(Boolean);
  } else {
    throw new Error("This page is not a supported ChatGPT or Claude conversation.");
  }

  const messages = [];
  for (const item of nodes) {
    const text = (item.element.innerText || item.element.textContent || "").trim();
    if (!text) continue;
    const idElement = item.element.closest("[data-message-id]") || item.element.querySelector("[data-message-id]");
    const timeElement = item.element.closest("article")?.querySelector("time[datetime]") || item.element.querySelector("time[datetime]");
    messages.push({
      id: idElement?.getAttribute("data-message-id") || `${item.role}-${messages.length}`,
      role: item.role,
      text,
      timestamp: timeElement?.getAttribute("datetime") || null,
      model: null,
    });
  }

  if (!messages.length) {
    throw new Error("No supported visible message containers were found on this page.");
  }

  const match = source === "chatgpt"
    ? location.pathname.match(/\/c\/([^/?#]+)/)
    : location.pathname.match(/\/(?:chat|chats)\/([^/?#]+)/);
  const conversationId = match?.[1] || `${source}-${location.pathname.replace(/[^a-zA-Z0-9._-]+/g, "-") || "current"}`;
  const cleanTitle = document.title.replace(/\s*[|—-]\s*(ChatGPT|Claude).*$/i, "").trim();
  return {
    schema: "continuity-bridge/live-capture-v1",
    source,
    conversation: {
      id: conversationId,
      title: cleanTitle || `Live ${source} conversation`,
      sourceUrl: `${location.origin}${location.pathname}`,
      messages,
    },
  };
}

captureButton.addEventListener("click", async () => {
  const port = Number.parseInt(portInput.value, 10);
  const token = tokenInput.value.trim();
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    setStatus("Enter a valid receiver port.");
    return;
  }
  if (!token) {
    setStatus("Paste the receiver token shown by ContinuityBridge.");
    return;
  }

  captureButton.disabled = true;
  setStatus("Reading the visible conversation…");
  try {
    await chrome.storage.local.set({ capturePort: port, captureToken: token });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active browser tab is available.");
    const [{ result: payload }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractVisibleConversation,
    });
    setStatus(`Found ${payload.conversation.messages.length} messages. Sending to local Lore…`);
    const response = await fetch(`http://127.0.0.1:${port}/capture`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `receiver returned HTTP ${response.status}`);
    if (body.status === "unchanged") {
      setStatus(`Already current: ${body.messageCount} messages were unchanged.`);
    } else {
      setStatus(`Captured ${body.messageCount} messages into Lore.\n${body.sourceFileId}`);
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  } finally {
    captureButton.disabled = false;
  }
});


const $ = id => document.getElementById(id);

const chat = $("chat");
const form = $("chat-form");
const input = $("message");
const sendBtn = $("send");
const stopBtn = $("stop");
const searchInput = $("web-search");
const modePill = $("mode-pill");
const connectionLabel = $("connection-label");
const historyList = $("chat-history");
const app = $("app");

const STORAGE_KEY = "mini_chatgpt_saved_chats_v10";
const THEME_KEY = "mini_chatgpt_theme_v10";

let conversations = [];
let activeId = null;
let sending = false;
let abortController = null;
let requestNumber = 0;

const escapeHTML = value =>
  String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));

function newId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + "-" + Math.random();
}

/* ------------------------------------------
   MARKDOWN FORMATTING
------------------------------------------ */

function inlineMarkdown(text) {
  let value = escapeHTML(text);
  const code = [];

  value = value.replace(/`([^`\n]+)`/g, (_, content) => {
    const index = code.push(
      "<code>" + content + "</code>"
    ) - 1;
    return "\uE000" + index + "\uE001";
  });

  value = value.replace(
    /\*\*(.+?)\*\*/g,
    "<strong>$1</strong>"
  );

  value = value.replace(
    /__(.+?)__/g,
    "<strong>$1</strong>"
  );

  value = value.replace(
    /(^|[\s(])\*([^*\n]+)\*/g,
    "$1<em>$2</em>"
  );

  value = value.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (_, label, url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
  );

  value = value.replace(
    /\uE000(\d+)\uE001/g,
    (_, index) => code[Number(index)]
  );

  return value;
}

function markdown(text) {
  const lines = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  let html = "";
  let list = "";
  let inCode = false;
  let codeLines = [];
  let paragraph = [];

  function closeParagraph() {
    if (paragraph.length) {
      html += "<p>" +
        paragraph.map(inlineMarkdown).join("<br>") +
        "</p>";
      paragraph = [];
    }
  }

  function closeList() {
    if (list) {
      html += `</${list}>`;
      list = "";
    }
  }

  for (const line of lines) {
    const s = line.trim();

    if (s.startsWith("```")) {
      closeParagraph();
      closeList();

      if (!inCode) {
        inCode = true;
        codeLines = [];
      } else {
        html += `<pre><code>${escapeHTML(
          codeLines.join("\n")
        )}</code></pre>`;
        inCode = false;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!s) {
      closeParagraph();
      closeList();
      continue;
    }

    if (/^---+$/.test(s)) {
      closeParagraph();
      closeList();
      html += "<hr>";
      continue;
    }

    const heading = s.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeParagraph();
      closeList();
      const level = heading[1].length;
      html += `<h${level}>${inlineMarkdown(
        heading[2]
      )}</h${level}>`;
      continue;
    }

    const bullet = s.match(/^[-*+]\s+(.+)$/);
    const numbered = s.match(/^\d+[.)]\s+(.+)$/);

    if (bullet || numbered) {
      closeParagraph();
      const kind = bullet ? "ul" : "ol";

      if (list !== kind) {
        closeList();
        list = kind;
        html += `<${kind}>`;
      }

      html += `<li>${inlineMarkdown(
        (bullet || numbered)[1]
      )}</li>`;
      continue;
    }

    if (s.startsWith("> ")) {
      closeParagraph();
      closeList();
      html += `<blockquote>${inlineMarkdown(
        s.substring(2)
      )}</blockquote>`;
      continue;
    }

    closeList();
    paragraph.push(s);
  }

  closeParagraph();
  closeList();

  if (inCode) {
    html += `<pre><code>${escapeHTML(
      codeLines.join("\n")
    )}</code></pre>`;
  }

  return html;
}

/* ------------------------------------------
   BROWSER CHAT STORAGE
------------------------------------------ */

function saveChats() {
  try {
    const data = conversations.slice(0, 30).map(c => ({
      ...c,
      messages: c.messages.slice(-40)
    }));

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(data)
    );
  } catch (error) {
    console.warn("Unable to save chats:", error);
  }
}

function loadChats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : [];

    conversations = Array.isArray(data)
      ? data.filter(c =>
          c && typeof c.id === "string" &&
          Array.isArray(c.messages)
        )
      : [];
  } catch {
    conversations = [];
  }
}

function activeChat() {
  return conversations.find(c => c.id === activeId);
}

function createChat() {
  const conversation = {
    id: String(newId()),
    title: "New chat",
    messages: []
  };

  conversations.unshift(conversation);
  activeId = conversation.id;
  saveChats();
  renderHistory();

  return conversation;
}

function renderHistory() {
  historyList.replaceChildren();

  for (const conversation of conversations) {
    const row = document.createElement("div");
    row.className = "history-item";

    if (conversation.id === activeId) {
      row.classList.add("active");
    }

    const open = document.createElement("button");
    open.className = "history-open";
    open.textContent = conversation.title;
    open.title = conversation.title;

    open.onclick = () => {
      if (sending) return;
      activeId = conversation.id;
      renderChat();
      renderHistory();
      closeMobileSidebar();
    };

    const remove = document.createElement("button");
    remove.className = "delete-chat";
    remove.textContent = "×";
    remove.title = "Delete chat";
    remove.setAttribute("aria-label", "Delete chat");

    remove.onclick = () => {
      if (sending) return;

      conversations = conversations.filter(
        c => c.id !== conversation.id
      );

      if (activeId === conversation.id) {
        activeId = null;
        renderChat();
      }

      saveChats();
      renderHistory();
    };

    row.append(open, remove);
    historyList.append(row);
  }
}

/* ------------------------------------------
   WELCOME SCREEN
------------------------------------------ */

function showWelcome() {
  chat.innerHTML = `
    <div class="welcome" id="welcome">
      <div class="welcome-icon">✦</div>
      <h1>What can I help with?</h1>

      <div class="suggestions">
        <button class="suggestion"
          data-question="Explain artificial intelligence in simple words">
          ✨ Explain AI
        </button>

        <button class="suggestion"
          data-question="Explain Python programming with an example">
          💻 Learn Python
        </button>

        <button class="suggestion"
          data-question="What are the latest developments in AI?">
          🌐 Latest AI news
        </button>

        <button class="suggestion"
          data-question="Explain machine learning with real-life examples">
          📚 Machine learning
        </button>
      </div>
    </div>
  `;

  chat.querySelectorAll(".suggestion").forEach(btn => {
    btn.onclick = () => sendMessage(
      btn.dataset.question || ""
    );
  });
}

/* ------------------------------------------
   GEMINI STATUS
------------------------------------------ */

function setMode(mode) {
  const online = mode === "online";

  modePill.textContent = online
    ? "Online · Gemini"
    : "Offline fallback";

  connectionLabel.textContent = online
    ? "Gemini API available"
    : "Using offline fallback";

  document.querySelector(".status-dot")
    .style.background = online ? "#10a37f" : "#d97706";
}

async function checkStatus() {
  try {
    const response = await fetch("/api/health", {
      cache: "no-store"
    });

    if (!response.ok) throw new Error("Backend error");

    const data = await response.json();

    modePill.textContent = data.gemini_configured
      ? "Gemini configured"
      : "Offline fallback";

    connectionLabel.textContent = data.gemini_configured
      ? "Ready to chat"
      : "Gemini not configured";

    document.querySelector(".status-dot")
      .style.background = data.gemini_configured
        ? "#10a37f"
        : "#d97706";

  } catch {
    modePill.textContent = "Backend unavailable";
    connectionLabel.textContent = "Start FastAPI server";
  }
}

/* ------------------------------------------
   MESSAGE DISPLAY
------------------------------------------ */

function scrollBottom() {
  chat.scrollTop = chat.scrollHeight;
}

function addUserMessage(text) {
  chat.querySelector("#welcome")?.remove();

  const row = document.createElement("div");
  row.className = "message-row";

  const bubble = document.createElement("div");
  bubble.className = "user-bubble";
  bubble.textContent = text;

  row.append(bubble);
  chat.append(row);
  scrollBottom();
}

function addAssistantMessage(
  answer,
  mode = "online",
  sources = [],
  allowRegenerate = false
) {
  const row = document.createElement("div");
  row.className = "message-row";

  const header = document.createElement("div");
  header.className = "assistant-header";

  const avatar = document.createElement("span");
  avatar.className = "assistant-avatar";
  avatar.textContent = "✦";

  const label = document.createElement("span");
  label.className = "meta";
  label.textContent = mode === "online"
    ? "Mini ChatGPT · Gemini"
    : mode === "offline"
      ? "Mini ChatGPT · Offline fallback"
      : "Mini ChatGPT";

  header.append(avatar, label);

  const body = document.createElement("div");
  body.className = "answer";
  body.innerHTML = markdown(answer);

  row.append(header, body);

  if (Array.isArray(sources) && sources.length) {
    const box = document.createElement("div");
    box.className = "sources";

    const heading = document.createElement("strong");
    heading.textContent = "Web sources";
    box.append(heading);

    sources.forEach(source => {
      try {
        const url = new URL(source.url);
        if (!["http:", "https:"].includes(url.protocol)) return;

        const link = document.createElement("a");
        link.href = url.href;
        link.textContent = source.title || url.hostname;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        box.append(link);
      } catch {}
    });

    row.append(box);
  }

  const actions = document.createElement("div");
  actions.className = "message-actions";

  const copy = document.createElement("button");
  copy.className = "action-button";
  copy.textContent = "▢ Copy";

  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(answer);
      copy.textContent = "✓ Copied";
    } catch {
      copy.textContent = "Copy unavailable";
    }
  };

  actions.append(copy);

  if (allowRegenerate) {
    const regenerate = document.createElement("button");
    regenerate.className = "action-button";
    regenerate.textContent = "↻ Regenerate";
    regenerate.onclick = regenerateResponse;
    actions.append(regenerate);
  }

  row.append(actions);
  chat.append(row);
  scrollBottom();
}

function renderChat() {
  chat.replaceChildren();

  const conversation = activeChat();

  if (!conversation || !conversation.messages.length) {
    showWelcome();
    return;
  }

  conversation.messages.forEach((msg, index) => {
    if (msg.role === "user") {
      addUserMessage(msg.content);
    } else {
      addAssistantMessage(
        msg.content,
        msg.mode || "online",
        msg.sources || [],
        index === conversation.messages.length - 1
      );
    }
  });
}

function typingIndicator() {
  const row = document.createElement("div");
  row.className = "message-row";

  row.innerHTML = `
    <div class="assistant-header">
      <span class="assistant-avatar">✦</span>
      <span class="meta">Thinking…</span>
    </div>
    <div class="typing-dots">
      <span></span><span></span><span></span>
    </div>
  `;

  chat.append(row);
  scrollBottom();
  return row;
}

/* ------------------------------------------
   SEND MESSAGE
------------------------------------------ */

function setSending(value) {
  sending = value;
  sendBtn.disabled = value;
  sendBtn.hidden = value;
  stopBtn.hidden = !value;
}

async function sendMessage(text) {
  const question = String(text).trim();
  if (!question || sending) return;

  let conversation = activeChat();
  if (!conversation) conversation = createChat();

  const previousHistory = conversation.messages
    .slice(-12)
    .map(m => ({
      role: m.role,
      content: m.content
    }));

  if (conversation.messages.length === 0) {
    conversation.title = question.slice(0, 50);
  }

  conversation.messages.push({
    role: "user",
    content: question
  });

  saveChats();
  renderHistory();

  addUserMessage(question);

  input.value = "";
  input.style.height = "auto";

  abortController = new AbortController();
  const thisRequest = ++requestNumber;
  setSending(true);

  const typing = typingIndicator();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abortController.signal,
      body: JSON.stringify({
        message: question,
        history: previousHistory,
        web_search: searchInput.checked
      })
    });

    if (!response.ok) {
      throw new Error("Backend HTTP " + response.status);
    }

    const data = await response.json();

    if (thisRequest !== requestNumber) return;

    const answer = data.answer || "No response received.";
    const mode = data.mode || "offline";
    const sources = data.sources || [];

    conversation.messages.push({
      role: "assistant",
      content: answer,
      mode,
      sources
    });

    setMode(mode);
    saveChats();
    renderChat();

  } catch (error) {
    const stopped = error.name === "AbortError";

    const answer = stopped
      ? "Response stopped."
      : "Unable to get a response. Please check the backend terminal.";

    conversation.messages.push({
      role: "assistant",
      content: answer,
      mode: "error",
      sources: []
    });

    saveChats();
    renderChat();

  } finally {
    typing.remove();
    abortController = null;
    setSending(false);
    input.focus();
  }
}

/* ------------------------------------------
   REGENERATE LAST RESPONSE
------------------------------------------ */

function regenerateResponse() {
  if (sending) return;

  const conversation = activeChat();
  if (!conversation) return;

  if (conversation.messages.at(-1)?.role === "assistant") {
    conversation.messages.pop();
  }

  const last = conversation.messages.at(-1);

  if (!last || last.role !== "user") return;

  const question = last.content;
  conversation.messages.pop();

  saveChats();
  renderChat();
  sendMessage(question);
}

/* ------------------------------------------
   NEW CHAT / FORM EVENTS
------------------------------------------ */

function newChat() {
  if (sending) return;

  activeId = null;
  input.value = "";
  input.style.height = "auto";

  renderChat();
  renderHistory();
  closeMobileSidebar();
  input.focus();
}

form.addEventListener("submit", event => {
  event.preventDefault();
  sendMessage(input.value);
});

input.addEventListener("keydown", event => {
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing
  ) {
    event.preventDefault();
    form.requestSubmit();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height =
    Math.min(input.scrollHeight, 180) + "px";
});

stopBtn.addEventListener("click", () => {
  abortController?.abort();
});

$("new-chat").addEventListener("click", newChat);
$("top-new-chat").addEventListener("click", newChat);

/* ------------------------------------------
   SIDEBAR
------------------------------------------ */

function closeMobileSidebar() {
  if (window.innerWidth <= 760) {
    app.classList.add("sidebar-closed");
  }
}

$("toggle-sidebar").addEventListener("click", () => {
  app.classList.toggle("sidebar-closed");
});

$("close-sidebar").addEventListener("click", () => {
  app.classList.add("sidebar-closed");
});

$("sidebar-overlay").addEventListener("click", () => {
  app.classList.add("sidebar-closed");
});

if (window.innerWidth <= 760) {
  app.classList.add("sidebar-closed");
}

/* ------------------------------------------
   DARK / LIGHT THEME
------------------------------------------ */

function applyTheme(theme) {
  const selected = theme === "dark" ? "dark" : "light";

  document.documentElement.setAttribute(
    "data-theme",
    selected
  );

  $("theme-toggle").textContent =
    selected === "dark" ? "☀" : "☾";

  $("theme-toggle").title =
    selected === "dark"
      ? "Switch to light mode"
      : "Switch to dark mode";

  try {
    localStorage.setItem(THEME_KEY, selected);
  } catch {}
}

$("theme-toggle").addEventListener("click", () => {
  const current = document.documentElement
    .getAttribute("data-theme");

  applyTheme(current === "dark" ? "light" : "dark");
});

/* ------------------------------------------
   INITIALIZE
------------------------------------------ */

loadChats();
renderHistory();
renderChat();

try {
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
} catch {
  applyTheme("light");
}

checkStatus();

console.log("Mini ChatGPT frontend v10 loaded");

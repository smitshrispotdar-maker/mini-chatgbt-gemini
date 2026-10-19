const chat = document.getElementById("chat");
const form = document.getElementById("chat-form");
const messageInput = document.getElementById("message");
const sendButton = document.getElementById("send");
const webSearchInput = document.getElementById("web-search");
const modePill = document.getElementById("mode-pill");
const connectionLabel = document.getElementById("connection-label");
const welcome = document.getElementById("welcome");

let history = [];
let isSending = false;

function setMode(mode) {
  const online = mode === "online";
  modePill.textContent = online ? "Online · Gemini" : "Offline fallback";
  connectionLabel.textContent = online ? "Gemini API available" : "Using offline fallback";
  document.querySelector(".status-dot").style.background = online ? "#16a34a" : "#d97706";
}

async function checkStatus() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    if (!data.gemini_configured) {
      modePill.textContent = "API key not configured";
      connectionLabel.textContent = "Offline fallback available";
    } else {
      modePill.textContent = "Gemini configured";
      connectionLabel.textContent = "Ready to chat";
    }
  } catch {
    modePill.textContent = "Backend unavailable";
    connectionLabel.textContent = "Start the FastAPI server";
  }
}
checkStatus();

function addUserMessage(text) {
  welcome?.remove();
  const row = document.createElement("div");
  row.className = "message-row";
  const bubble = document.createElement("div");
  bubble.className = "user-bubble";
  bubble.textContent = text;
  row.appendChild(bubble);
  chat.appendChild(row);
  scrollToBottom();
}

function addAssistantMessage(answer, mode, sources = []) {
  const row = document.createElement("div");
  row.className = "message-row";
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = mode === "online" ? "Mini ChatGPT · Gemini" : "Mini ChatGPT · Offline fallback";
  const body = document.createElement("div");
  body.className = "answer";
  body.textContent = answer;
  row.append(meta, body);

  if (sources.length) {
    const sourceBox = document.createElement("div");
    sourceBox.className = "sources";
    const title = document.createElement("strong");
    title.textContent = "Web sources";
    sourceBox.appendChild(title);
    sources.forEach(source => {
      try {
        const url = new URL(source.url);
        if (!["http:", "https:"].includes(url.protocol)) return;
        const link = document.createElement("a");
        link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = source.title || url.hostname;
        sourceBox.appendChild(link);
      } catch {}
    });
    row.appendChild(sourceBox);
  }

  chat.appendChild(row);
  scrollToBottom();
}

function scrollToBottom() {
  chat.scrollTop = chat.scrollHeight;
}

async function sendMessage(text) {
  const question = text.trim();
  if (!question || isSending) return;

  isSending = true;
  sendButton.disabled = true;
  addUserMessage(question);
  messageInput.value = "";

  const typing = document.createElement("div");
  typing.className = "message-row typing";
  typing.textContent = "Thinking…";
  chat.appendChild(typing);
  scrollToBottom();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: question,
        history: history.slice(-12),
        web_search: webSearchInput.checked
      })
    });

    if (!response.ok) throw new Error("Backend request failed");
    const data = await response.json();
    typing.remove();
    addAssistantMessage(data.answer, data.mode, data.sources || []);
    setMode(data.mode);
    history.push({ role: "user", content: question });
    history.push({ role: "assistant", content: data.answer });
    history = history.slice(-24);
  } catch (error) {
    typing.remove();
    addAssistantMessage(
      "I couldn't reach the backend. Check that the FastAPI server is running. If the server is running but the internet or Gemini API is unavailable, its offline fallback can answer a limited set of FAQs.",
      "offline"
    );
    setMode("offline");
  } finally {
    isSending = false;
    sendButton.disabled = false;
    messageInput.focus();
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  sendMessage(messageInput.value);
});

messageInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 180) + "px";
});

document.querySelectorAll(".suggestion").forEach(button => {
  button.addEventListener("click", () => sendMessage(button.dataset.question || ""));
});

document.getElementById("new-chat").addEventListener("click", () => {
  history = [];
  chat.innerHTML = "";
  const welcomeClone = document.createElement("div");
  welcomeClone.className = "welcome";
  welcomeClone.innerHTML = '<div class="welcome-icon">✦</div><h1>What can I help with?</h1><p>Ask a question. Online, Gemini can answer and web search can find recent information.</p><div class="suggestions"><button class="suggestion" data-question="Explain artificial intelligence in simple words">Explain AI simply</button><button class="suggestion" data-question="What is a Python function? Give an example.">Learn Python</button><button class="suggestion" data-question="What are the latest developments in AI?">Latest AI developments</button></div>';
  chat.appendChild(welcomeClone);
  welcomeClone.querySelectorAll(".suggestion").forEach(button => {
    button.addEventListener("click", () => sendMessage(button.dataset.question || ""));
  });
});

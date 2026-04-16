// ── Config ──
// Since the HTML is served by FastAPI, we use a relative URL — no hardcoded port needed.
const API_URL = "/chat";

let recognition = null;
let isListening   = false;

// ── Auto-resize textarea ──
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ── Fill chip text into input ──
function fillChip(text) {
  const inp = document.getElementById('userInput');
  inp.value = text;
  autoResize(inp);
  inp.focus();
}

// ── Enter to send (Shift+Enter = newline) ──
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

// ── Append message bubble ──
function addMessage(role, html) {
  const welcome = document.getElementById('welcome');
  if (welcome) welcome.remove();

  const msgs = document.getElementById('messages');
  const div  = document.createElement('div');
  div.className = `msg ${role}`;

  const avatarContent = role === 'bot'
    ? `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
         <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
       </svg>`
    : 'YOU';
  const avatarClass = role === 'user' ? 'user' : 'bot';

  div.innerHTML = `
    <div class="avatar ${avatarClass}">${avatarContent}</div>
    <div class="bubble">${html}</div>
  `;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

// ── Typing indicator ──
function showTyping() {
  const msgs = document.getElementById('messages');
  const div  = document.createElement('div');
  div.className = 'msg bot';
  div.id = 'typing-indicator';
  div.innerHTML = `
    <div class="avatar bot">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      </svg>
    </div>
    <div class="bubble typing-bubble"><span></span><span></span><span></span></div>
  `;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}
function hideTyping() {
  const t = document.getElementById('typing-indicator');
  if (t) t.remove();
}

// ── Format markdown-like bot reply to HTML ──
function formatReply(text) {
  let formatted = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^#{1,3}\s(.+)/gm, '<strong style="font-size:0.95rem;color:var(--accent)">$1</strong>')
    .replace(/\n{2,}/g, '</p><p style="margin-top:8px">')
    .replace(/\n/g, '<br>');

  formatted = `<p>${formatted}</p>`;

  // Add disclaimer box if AI mentions it's not a doctor
  const lower = formatted.toLowerCase();
  if (lower.includes('not a doctor') || lower.includes('ai, not') || lower.includes('consult')) {
    formatted += `<div class="disclaimer">⚠️ AI-generated health information only. Please consult a qualified doctor for proper diagnosis and treatment.</div>`;
  }
  return formatted;
}

// ── Escape HTML for user input ──
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Main send function ──
async function sendMessage() {
  const input   = document.getElementById('userInput');
  const message = input.value.trim();
  if (!message) return;

  addMessage('user', escapeHtml(message));
  input.value = '';
  autoResize(input);
  showTyping();

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });

    hideTyping();

    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();
    addMessage('bot', formatReply(data.reply || 'No response from server.'));

  } catch (err) {
    hideTyping();
    const isNetwork = err.message.includes('fetch') || err.message.includes('Failed');
    addMessage('bot', formatReply(
      isNetwork
        ? `**Connection Error**\n\nCould not reach the MediMind backend.\n\nPlease make sure **app.py** is running:\n\`uvicorn app:app --reload\`\n\n_Error: ${err.message}_`
        : `**Error:** ${err.message}`
    ));
  }
}

// ── Voice Input ──
function toggleMic() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    alert('Voice input is not supported in your browser. Try Chrome or Edge.');
    return;
  }
  const btn = document.getElementById('micBtn');
  if (isListening) {
    recognition.stop();
    isListening = false;
    btn.classList.remove('active');
    return;
  }

  const SR   = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang            = 'hi-IN';
  recognition.interimResults  = false;

  recognition.onresult = e => {
    const inp = document.getElementById('userInput');
    inp.value += e.results[0][0].transcript;
    autoResize(inp);
  };
  recognition.onerror = () => { isListening = false; btn.classList.remove('active'); };
  recognition.onend   = () => { isListening = false; btn.classList.remove('active'); };

  recognition.start();
  isListening = true;
  btn.classList.add('active');
}

// ── Focus on load ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('userInput').focus();
});

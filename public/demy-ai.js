/*!
 * Demy AI - Website Chat Widget
 * Version: 1.0.0
 * https://demyai.com
 */
(function (window, document) {
  'use strict';

  // ─── CONFIGURATION ────────────────────────────────────────
  const WEBHOOK_URL       = 'https://n8n-service-5mdm.onrender.com/webhook/demy-ai/chat';
  const WIDGET_VERSION    = '1.0.0';
  const STORAGE_KEY_PREFIX = 'demy_ai_';
  const RECONNECT_DELAY_MS = 3000;
  const MAX_RETRIES       = 3;

  // ─── READ SCRIPT ATTRIBUTES ───────────────────────────────
  const currentScript = document.currentScript || (function () {
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  const TENANT_ID = currentScript.getAttribute('data-tenant');
  const SECRET    = currentScript.getAttribute('data-secret');
  const BOT_COLOR = currentScript.getAttribute('data-color')    || '#1a1a2e';
  const BOT_NAME  = currentScript.getAttribute('data-name')     || 'Support';
  const POSITION  = currentScript.getAttribute('data-position') || 'right';
  const GREETING  = currentScript.getAttribute('data-greeting') || 'Hi there! \uD83D\uDC4B How can I help you today?';

  if (!TENANT_ID || !SECRET) {
    console.error('[Demy AI] Missing data-tenant or data-secret attribute.');
    return;
  }

  if (window.__demyAiLoaded) {
    console.warn('[Demy AI] Widget already loaded.');
    return;
  }
  window.__demyAiLoaded = true;

  // ─── SESSION MANAGEMENT ───────────────────────────────────
  const SESSION_KEY = STORAGE_KEY_PREFIX + TENANT_ID + '_session';
  const HISTORY_KEY = STORAGE_KEY_PREFIX + TENANT_ID + '_history';

  function getSessionId() {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function saveHistory(msgs) {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(msgs.slice(-50)));
    } catch (e) { /* storage full */ }
  }

  function loadHistory() {
    try {
      const raw = sessionStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  // ─── STATE ────────────────────────────────────────────────
  var sessionId   = getSessionId();
  var messages    = loadHistory();
  var isOpen      = false;
  var isTyping    = false;
  var retryCount  = 0;

  // ─── STYLES ───────────────────────────────────────────────
  function injectStyles() {
    const pos = POSITION === 'left'
      ? 'left:24px;right:auto;'
      : 'right:24px;left:auto;';

    const css = [
      '#demy-ai-launcher{position:fixed;bottom:24px;' + pos + 'width:56px;height:56px;border-radius:50%;background:' + BOT_COLOR + ';color:#fff;border:none;cursor:pointer;z-index:2147483647;box-shadow:0 4px 24px rgba(0,0,0,.25);transition:transform .2s,box-shadow .2s;display:flex;align-items:center;justify-content:center;font-size:24px;outline:none;}',
      '#demy-ai-launcher:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(0,0,0,.3);}',
      '#demy-ai-launcher .demy-badge{position:absolute;top:-2px;right:-2px;width:18px;height:18px;background:#e94560;border-radius:50%;border:2px solid #fff;display:none;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;}',
      '#demy-ai-window{position:fixed;bottom:92px;' + pos + 'width:360px;height:520px;background:#fff;border-radius:20px;box-shadow:0 12px 48px rgba(0,0,0,.18);display:flex;flex-direction:column;z-index:2147483646;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;overflow:hidden;transform:scale(.95) translateY(8px);opacity:0;pointer-events:none;transition:transform .25s cubic-bezier(.34,1.56,.64,1),opacity .2s ease;}',
      '#demy-ai-window.demy-open{transform:scale(1) translateY(0);opacity:1;pointer-events:all;}',
      '#demy-ai-header{background:' + BOT_COLOR + ';padding:16px 20px;display:flex;align-items:center;gap:12px;flex-shrink:0;}',
      '.demy-avatar{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}',
      '.demy-header-info{flex:1;}',
      '.demy-header-name{color:#fff;font-weight:700;font-size:15px;line-height:1.2;}',
      '.demy-header-status{color:rgba(255,255,255,.75);font-size:12px;display:flex;align-items:center;gap:4px;}',
      '.demy-status-dot{width:6px;height:6px;background:#4ade80;border-radius:50%;display:inline-block;}',
      '.demy-close-btn{background:none;border:none;color:rgba(255,255,255,.8);font-size:20px;cursor:pointer;padding:4px;line-height:1;}',
      '.demy-close-btn:hover{color:#fff;}',
      '#demy-ai-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;scroll-behavior:smooth;}',
      '#demy-ai-messages::-webkit-scrollbar{width:4px;}',
      '#demy-ai-messages::-webkit-scrollbar-track{background:transparent;}',
      '#demy-ai-messages::-webkit-scrollbar-thumb{background:#ddd;border-radius:2px;}',
      '.demy-msg-row{display:flex;flex-direction:column;gap:2px;}',
      '.demy-msg-row.demy-user{align-items:flex-end;}',
      '.demy-msg-row.demy-bot{align-items:flex-start;}',
      '.demy-bubble{max-width:82%;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.55;word-wrap:break-word;}',
      '.demy-bubble.demy-user{background:' + BOT_COLOR + ';color:#fff;border-bottom-right-radius:4px;}',
      '.demy-bubble.demy-bot{background:#f1f3f4;color:#1a1a1a;border-bottom-left-radius:4px;}',
      '.demy-timestamp{font-size:10px;color:#bbb;padding:0 4px;}',
      '.demy-typing-indicator{display:flex;align-items:center;gap:4px;padding:10px 14px;background:#f1f3f4;border-radius:16px;border-bottom-left-radius:4px;width:fit-content;}',
      '.demy-dot{width:7px;height:7px;background:#aaa;border-radius:50%;animation:demy-pulse 1.2s infinite ease-in-out;}',
      '.demy-dot:nth-child(2){animation-delay:.2s;}',
      '.demy-dot:nth-child(3){animation-delay:.4s;}',
      '@keyframes demy-pulse{0%,60%,100%{transform:scale(1);opacity:.5}30%{transform:scale(1.3);opacity:1}}',
      '.demy-error-banner{background:#fef2f2;border-top:1px solid #fecaca;padding:8px 16px;font-size:12px;color:#dc2626;text-align:center;display:none;}',
      '#demy-ai-input-area{padding:12px 16px;border-top:1px solid #f0f0f0;display:flex;gap:10px;align-items:flex-end;flex-shrink:0;background:#fff;}',
      '#demy-ai-input{flex:1;padding:10px 14px;border:1.5px solid #e8e8e8;border-radius:24px;font-size:14px;outline:none;resize:none;font-family:inherit;line-height:1.4;max-height:100px;overflow-y:auto;transition:border-color .2s;color:#1a1a1a;background:#ffffff;-webkit-text-fill-color:#1a1a1a;}',
      '#demy-ai-input:focus{border-color:' + BOT_COLOR + ';}',
      '#demy-ai-input::placeholder{color:#bbb;}',
      '#demy-ai-send{width:38px;height:38px;border-radius:50%;background:' + BOT_COLOR + ';border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .2s,transform .15s;font-size:16px;}',
      '#demy-ai-send:hover{background:#e94560;transform:scale(1.05);}',
      '#demy-ai-send:disabled{background:#ddd;cursor:not-allowed;transform:none;}',
      '#demy-ai-footer{padding:6px 16px 10px;text-align:center;font-size:11px;color:#ccc;flex-shrink:0;background:#fff;-webkit-text-fill-color:#ccc;}',
      '#demy-ai-footer a{color:#ccc;text-decoration:none;}',
      '#demy-ai-footer a:hover{color:#999;}',
      '@media(max-width:480px){#demy-ai-window{width:calc(100vw - 24px)!important;height:calc(100vh - 100px)!important;bottom:80px!important;left:12px!important;right:12px!important;border-radius:16px;}}'
    ].join('');

    var el = document.createElement('style');
    el.id = 'demy-ai-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ─── BUILD DOM ────────────────────────────────────────────
  function buildWidget() {
    var launcher = document.createElement('button');
    launcher.id = 'demy-ai-launcher';
    launcher.setAttribute('aria-label', 'Open chat');
    launcher.innerHTML =
      '<span class="demy-icon">\uD83D\uDCAC</span>' +
      '<span class="demy-badge" id="demy-badge">1</span>';

    var win = document.createElement('div');
    win.id = 'demy-ai-window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'Customer support chat');
    win.innerHTML =
      '<div id="demy-ai-header">' +
        '<div class="demy-avatar">\uD83E\uDD16</div>' +
        '<div class="demy-header-info">' +
          '<div class="demy-header-name">' + escapeHtml(BOT_NAME) + '</div>' +
          '<div class="demy-header-status">' +
            '<span class="demy-status-dot"></span>' +
            'Online \u2014 typically replies instantly' +
          '</div>' +
        '</div>' +
        '<button class="demy-close-btn" id="demy-close-btn" aria-label="Close chat">\u2715</button>' +
      '</div>' +
      '<div id="demy-ai-messages" role="log" aria-live="polite" aria-label="Chat messages"></div>' +
      '<div class="demy-error-banner" id="demy-error-banner">Connection issue. Retrying...</div>' +
      '<div id="demy-ai-input-area">' +
        '<textarea id="demy-ai-input" placeholder="Type a message..." rows="1" aria-label="Type your message" maxlength="1000"></textarea>' +
        '<button id="demy-ai-send" aria-label="Send message" disabled>\u27A4</button>' +
      '</div>' +
      '<div id="demy-ai-footer">Powered by <a href="https://demyai.com" target="_blank" rel="noopener noreferrer">Demy AI</a></div>';

    document.body.appendChild(launcher);
    document.body.appendChild(win);
  }

  // ─── HELPERS ──────────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatMessage(text) {
    return escapeHtml(text).replace(/\n/g, '<br>');
  }

  function scrollToBottom() {
    var c = document.getElementById('demy-ai-messages');
    if (c) c.scrollTop = c.scrollHeight;
  }

  // ─── RENDER ───────────────────────────────────────────────
  function renderMessage(role, text, timestamp) {
    var container = document.getElementById('demy-ai-messages');
    if (!container) return;

    var row = document.createElement('div');
    row.className = 'demy-msg-row ' + (role === 'user' ? 'demy-user' : 'demy-bot');

    var bubble = document.createElement('div');
    bubble.className = 'demy-bubble ' + (role === 'user' ? 'demy-user' : 'demy-bot');
    bubble.innerHTML = formatMessage(text);

    var time = document.createElement('div');
    time.className = 'demy-timestamp';
    time.textContent = formatTime(timestamp || new Date());

    row.appendChild(bubble);
    row.appendChild(time);
    container.appendChild(row);
    scrollToBottom();
  }

  function showTypingIndicator() {
    if (isTyping) return;
    isTyping = true;
    var container = document.getElementById('demy-ai-messages');
    if (!container) return;
    var row = document.createElement('div');
    row.className = 'demy-msg-row demy-bot';
    row.id = 'demy-typing-row';
    var ind = document.createElement('div');
    ind.className = 'demy-typing-indicator';
    ind.innerHTML = '<div class="demy-dot"></div><div class="demy-dot"></div><div class="demy-dot"></div>';
    row.appendChild(ind);
    container.appendChild(row);
    scrollToBottom();
  }

  function hideTypingIndicator() {
    isTyping = false;
    var row = document.getElementById('demy-typing-row');
    if (row) row.remove();
  }

  function renderHistory() {
    messages.forEach(function (msg) {
      renderMessage(msg.role, msg.text, new Date(msg.timestamp));
    });
  }

  function showError(show) {
    var b = document.getElementById('demy-error-banner');
    if (b) b.style.display = show ? 'block' : 'none';
  }

  // ─── SEND MESSAGE ─────────────────────────────────────────
  async function sendMessage() {
    var input   = document.getElementById('demy-ai-input');
    var sendBtn = document.getElementById('demy-ai-send');
    if (!input) return;

    var text = input.value.trim();
    if (!text || isTyping) return;

    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;

    var userMsg = { role: 'user', text: text, timestamp: new Date().toISOString() };
    messages.push(userMsg);
    saveHistory(messages);
    renderMessage('user', text);
    showTypingIndicator();
    showError(false);

    var success = false;
    retryCount = 0;

    while (!success && retryCount <= MAX_RETRIES) {
      try {
        var response = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id:   TENANT_ID,
            secret:      SECRET,
            session_id:  sessionId,
            customer_id: '',
            message:     text,
            channel:     'website',
            timestamp:   new Date().toISOString()
          })
        });

        if (!response.ok) throw new Error('HTTP ' + response.status);

        var data     = await response.json();
        var botReply = data.reply || data.data || 'Sorry, I could not process that. Please try again.';

        hideTypingIndicator();

        var botMsg = { role: 'bot', text: botReply, timestamp: new Date().toISOString() };
        messages.push(botMsg);
        saveHistory(messages);
        renderMessage('bot', botReply);

        success = true;
        retryCount = 0;
        showError(false);

      } catch (err) {
        retryCount++;
        if (retryCount <= MAX_RETRIES) {
          await new Promise(function (resolve) {
            setTimeout(resolve, RECONNECT_DELAY_MS);
          });
        }
      }
    }

    if (!success) {
      hideTypingIndicator();
      showError(true);
      renderMessage('bot', 'I am having trouble connecting right now. Please try again in a moment.');
    }

    sendBtn.disabled = false;
  }

  // ─── OPEN / CLOSE ─────────────────────────────────────────
  function openWidget() {
    var win      = document.getElementById('demy-ai-window');
    var launcher = document.getElementById('demy-ai-launcher');
    var input    = document.getElementById('demy-ai-input');
    var badge    = document.getElementById('demy-badge');

    isOpen = true;
    win.classList.add('demy-open');
    launcher.setAttribute('aria-label', 'Close chat');
    launcher.querySelector('.demy-icon').textContent = '\u2715';
    if (badge) badge.style.display = 'none';

    if (messages.length === 0) {
      setTimeout(function () {
        var greetMsg = { role: 'bot', text: GREETING, timestamp: new Date().toISOString() };
        messages.push(greetMsg);
        saveHistory(messages);
        renderMessage('bot', GREETING);
      }, 400);
    }

    setTimeout(function () { if (input) input.focus(); }, 300);
  }

  function closeWidget() {
    var win      = document.getElementById('demy-ai-window');
    var launcher = document.getElementById('demy-ai-launcher');
    isOpen = false;
    win.classList.remove('demy-open');
    launcher.setAttribute('aria-label', 'Open chat');
    launcher.querySelector('.demy-icon').textContent = '\uD83D\uDCAC';
  }

  function toggleWidget() {
    isOpen ? closeWidget() : openWidget();
  }

  // ─── EVENTS ───────────────────────────────────────────────
  function bindEvents() {
    document.getElementById('demy-ai-launcher').addEventListener('click', toggleWidget);
    document.getElementById('demy-close-btn').addEventListener('click', closeWidget);
    document.getElementById('demy-ai-send').addEventListener('click', sendMessage);

    var input = document.getElementById('demy-ai-input');

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    input.addEventListener('input', function () {
      var sendBtn = document.getElementById('demy-ai-send');
      sendBtn.disabled = this.value.trim() === '';
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) closeWidget();
    });

    document.addEventListener('click', function (e) {
      var win      = document.getElementById('demy-ai-window');
      var launcher = document.getElementById('demy-ai-launcher');
      if (isOpen && win && !win.contains(e.target) && launcher && !launcher.contains(e.target)) {
        closeWidget();
      }
    });
  }

  // ─── INIT ─────────────────────────────────────────────────
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    injectStyles();
    buildWidget();
    if (messages.length > 0) renderHistory();
    bindEvents();
    if (messages.length > 0 && !isOpen) {
      var badge = document.getElementById('demy-badge');
      if (badge) badge.style.display = 'flex';
    }
    console.log('[Demy AI] Widget v' + WIDGET_VERSION + ' initialized. Tenant: ' + TENANT_ID);
  }

  init();

})(window, document);

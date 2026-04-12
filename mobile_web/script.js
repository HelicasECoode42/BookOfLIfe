const APP_STATE = {
  activePage: "chat",
  activeMemoryPanel: "book",
  companionName: "温伴",
  companionState: "正在轻轻听你说",
  messages: [
    {
      role: "ai",
      text: "今天想从哪一段说起？你慢慢讲，我帮你把线索串起来。",
      cue: ""
    },
    {
      role: "user",
      text: "我今天在公园碰到老张了。"
    },
    {
      role: "ai",
      text: "老张是你以前在纺织厂一起上班的朋友，对吗？今天聊起了哪段旧事？",
      cue: "她关联到一段过去的记忆：你和老张在纺织厂一起上了十二年班。"
    }
  ],
  memoryPages: [
    {
      date: "2025年3月",
      text: "今天在公园碰到老张，站着聊了很久，又想起以前一起赶早班车的日子。",
      tags: ["老张", "公园", "怀念"]
    },
    {
      date: "2025年2月",
      text: "小女儿一家回来吃饭，外孙女一边包饺子一边问我年轻时的故事。",
      tags: ["家人", "春节", "温暖"]
    },
    {
      date: "2025年1月",
      text: "翻到一张旧照片，想起年轻时在桥边拍婚纱照，那天风特别大。",
      tags: ["老伴", "照片", "旧时光"]
    },
    {
      date: "2024年12月",
      text: "下了一场大雪，楼下孩子们堆雪人，我站在窗边看了很久。",
      tags: ["冬天", "楼下", "平静"]
    }
  ],
  graphMetrics: [
    { title: "人物线索", value: "8 个常出现的人", detail: "老张、老伴、小女儿最清晰" },
    { title: "时间脉络", value: "5 段关键年份", detail: "1978 到 1992 最密集" },
    { title: "情绪峰值", value: "怀念最常出现", detail: "其次是温暖和平静" },
    { title: "照片挂接", value: "18 张已归档", detail: "其中 11 张已带日期" }
  ],
  graphNodes: [
    { title: "人物", detail: "老张 · 小女儿 · 老伴 · 外孙女" },
    { title: "时间", detail: "纺织厂那几年 · 春节团聚 · 婚纱照那天" },
    { title: "地点", detail: "公园 · 家里厨房 · 外白渡桥" },
    { title: "情绪", detail: "怀念 · 温暖 · 平静" }
  ],
  photoClues: [
    { title: "2025年3月12日", detail: "公园合照，已挂到“老张”这条人物线", meta: "下午 3:10 · 已归档" },
    { title: "2025年2月2日", detail: "春节餐桌，已挂到“家人团聚”这页书", meta: "晚上 6:42 · 已归档" },
    { title: "1991年旧照片", detail: "婚纱照翻拍，待补地点和当天故事", meta: "旧照翻拍 · 待补充" }
  ],
  settings: [
    { label: "陪伴名字", value: "温伴" },
    { label: "说话方式", value: "像懂你的晚辈" },
    { label: "字体大小", value: "17px 大字" },
    { label: "语音播报", value: "已开启" },
    { label: "记忆数量", value: "23 页 / 18 张照片" }
  ]
};

const QUICK_REPLY_MAP = {
  "想起了什么": "今天有一件小事让我忽然想起以前。",
  "讲旧事": "我想讲讲以前在厂里的那段日子。",
  "看看照片": "我刚刚又翻到了一张旧照片。",
  "今天心情": "今天心里有点想念，也有点暖。",
  "想起家里人": "我今天一直在想家里人。"
};

const AI_REPLIES = [
  {
    text: "这条线索很重要，我先帮你记住。你还记得那天身边都有谁吗？",
    cue: "她关联到人物线索：这段回忆和“老张”“纺织厂”两条脉络相连。"
  },
  {
    text: "听起来这段记忆已经有画面了。你愿意再说一句当时最深的感受吗？",
    cue: "她关联到情绪线索：这段回忆更接近“怀念”和“温暖”。"
  },
  {
    text: "我把这一页先轻轻收下了。等会儿我们也可以顺着时间，把前后发生的事慢慢补上。",
    cue: "她关联到时间线索：这件事可以挂到“纺织厂那几年”这段时间里。"
  }
];

function renderStatusClock() {
  const clock = document.getElementById("statusClock");
  if (!clock) return;
  const now = new Date();
  clock.textContent = now.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function switchPage(page) {
  APP_STATE.activePage = page;
  document.querySelectorAll(".app-page").forEach((panel) => {
    const active = panel.dataset.page === page;
    panel.classList.toggle("is-active", active);
    panel.setAttribute("aria-hidden", active ? "false" : "true");
  });
  document.querySelectorAll(".tabbar-item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.tab === page);
  });
}

function switchMemoryPanel(panel) {
  APP_STATE.activeMemoryPanel = panel;
  document.querySelectorAll(".segment-btn").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.memoryPanel === panel);
  });
  document.querySelectorAll(".memory-panel").forEach((view) => {
    const active = view.dataset.memoryPanelView === panel;
    view.classList.toggle("is-active", active);
    view.hidden = !active;
  });
}

function createMessageNode(entry) {
  const row = document.createElement("article");
  row.className = `message-row ${entry.role}`;

  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = entry.role === "ai" ? APP_STATE.companionName : "你";
  row.appendChild(label);

  if (entry.cue) {
    const cue = document.createElement("div");
    cue.className = "memory-cue-bar";
    cue.textContent = entry.cue;
    row.appendChild(cue);
  }

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = entry.text;
  row.appendChild(bubble);

  return row;
}

function renderMessages() {
  const chatScroll = document.getElementById("chatScroll");
  if (!chatScroll) return;
  chatScroll.innerHTML = "";
  APP_STATE.messages.forEach((entry) => {
    chatScroll.appendChild(createMessageNode(entry));
  });
  chatScroll.scrollTop = chatScroll.scrollHeight;
}

function renderTyping() {
  const chatScroll = document.getElementById("chatScroll");
  if (!chatScroll) return null;
  const row = document.createElement("article");
  row.className = "message-row ai";

  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = APP_STATE.companionName;
  row.appendChild(label);

  const bubble = document.createElement("div");
  bubble.className = "message-bubble typing-bubble";
  bubble.innerHTML = [
    '<span class="typing-dot"></span>',
    '<span class="typing-dot"></span>',
    '<span class="typing-dot"></span>'
  ].join("");
  row.appendChild(bubble);

  chatScroll.appendChild(row);
  chatScroll.scrollTop = chatScroll.scrollHeight;
  return row;
}

function renderMemoryPages() {
  const root = document.getElementById("memoryBookList");
  if (!root) return;
  root.className = "memory-book-list";
  root.innerHTML = APP_STATE.memoryPages.map((item) => `
    <article class="memory-card">
      <span class="memory-date">${item.date}</span>
      <p class="memory-text">${item.text}</p>
      <div class="tag-row">
        ${item.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
      </div>
    </article>
  `).join("");
}

function renderGraphMetrics() {
  const root = document.getElementById("graphMetricGrid");
  if (!root) return;
  root.innerHTML = APP_STATE.graphMetrics.map((item) => `
    <article class="graph-metric-card">
      <strong>${item.title}</strong>
      <span>${item.value}</span>
      <span>${item.detail}</span>
    </article>
  `).join("");
}

function renderGraphNodes() {
  const root = document.getElementById("graphNodeList");
  if (!root) return;
  root.innerHTML = APP_STATE.graphNodes.map((item) => `
    <article class="graph-node-card">
      <strong>${item.title}</strong>
      <span>${item.detail}</span>
    </article>
  `).join("");
}

function renderPhotoClues() {
  const root = document.getElementById("photoClueList");
  if (!root) return;
  root.innerHTML = APP_STATE.photoClues.map((item) => `
    <article class="photo-clue-card">
      <strong>${item.title}</strong>
      <span>${item.detail}</span>
      <div class="photo-clue-meta">
        <span>${item.meta}</span>
        <span>按时间可回看</span>
      </div>
    </article>
  `).join("");
}

function renderSettings() {
  const root = document.getElementById("settingsList");
  if (!root) return;
  root.innerHTML = APP_STATE.settings.map((item) => `
    <article class="setting-row">
      <strong>${item.label}</strong>
      <div class="setting-right">
        <span>${item.value}</span>
        <span class="setting-arrow">›</span>
      </div>
    </article>
  `).join("");
}

function setCompanionMeta() {
  const name = document.getElementById("companionName");
  const state = document.getElementById("companionState");
  if (name) name.textContent = APP_STATE.companionName;
  if (state) state.textContent = APP_STATE.companionState;
}

function chooseReply(input) {
  if (input.includes("照片")) {
    return AI_REPLIES[2];
  }
  if (input.includes("老张") || input.includes("厂")) {
    return AI_REPLIES[0];
  }
  return AI_REPLIES[1];
}

function sendMessage() {
  const input = document.getElementById("chatInput");
  if (!input) return;
  const text = String(input.value || "").trim();
  if (!text) return;

  APP_STATE.messages.push({ role: "user", text });
  input.value = "";
  renderMessages();

  const typingNode = renderTyping();
  const reply = chooseReply(text);

  window.setTimeout(() => {
    typingNode?.remove();
    APP_STATE.messages.push({
      role: "ai",
      text: reply.text,
      cue: reply.cue
    });
    renderMessages();
  }, 1500);
}

function bindEvents() {
  document.querySelectorAll(".tabbar-item").forEach((button) => {
    button.addEventListener("click", () => switchPage(button.dataset.tab || "chat"));
  });

  document.querySelectorAll(".segment-btn").forEach((button) => {
    button.addEventListener("click", () => switchMemoryPanel(button.dataset.memoryPanel || "book"));
  });

  document.querySelectorAll(".quick-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const input = document.getElementById("chatInput");
      if (!input) return;
      input.value = QUICK_REPLY_MAP[chip.textContent.trim()] || chip.textContent.trim();
      input.focus();
    });
  });

  document.getElementById("sendBtn")?.addEventListener("click", sendMessage);
  document.getElementById("chatInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendMessage();
    }
  });

  document.getElementById("voiceInputBtn")?.addEventListener("click", () => {
    APP_STATE.companionState = "语音输入模块待接入";
    setCompanionMeta();
  });

  document.addEventListener("dblclick", (event) => {
    event.preventDefault();
  }, { passive: false });
}

function init() {
  renderStatusClock();
  window.setInterval(renderStatusClock, 60000);
  setCompanionMeta();
  renderMessages();
  renderMemoryPages();
  renderGraphMetrics();
  renderGraphNodes();
  renderPhotoClues();
  renderSettings();
  switchPage(APP_STATE.activePage);
  switchMemoryPanel(APP_STATE.activeMemoryPanel);
  bindEvents();
}

document.addEventListener("DOMContentLoaded", init);

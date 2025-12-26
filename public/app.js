(function () {
  const $ = (id) => document.getElementById(id);
  const chat = $("chat");

  const modeSetupBtn = $("modeSetup");
  const modeChapterBtn = $("modeChapter");
  const setupPanel = $("setupPanel");
  const chapterPanel = $("chapterPanel");

  const consoleTab = $("consoleTab");
  const readerTab = $("readerTab");
  const consoleView = $("consoleView");
  const readerView = $("readerView");

  const chapterSelect = $("chapterSelect");
  const prevChapterBtn = $("prevChapter");
  const nextChapterBtn = $("nextChapter");
  const refreshChaptersBtn = $("refreshChapters");
  const readerTitle = $("readerTitle");
  const readerMeta = $("readerMeta");
  const readerStatus = $("readerStatus");
  const readerBody = $("readerBody");
  const readerFont = $("readerFont");
  const readerFontSize = $("readerFontSize");
  const readerFontSizeValue = $("readerFontSizeValue");

  const editor = $("editor");
  const editorPath = $("editorPath");
  const editorContent = $("editorContent");
  const saveFile = $("saveFile");

  const readerFonts = {
    serif: '"Noto Serif SC","Source Han Serif SC","Songti SC",serif',
    sans: '"Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif',
    classic: '"Iowan Old Style","Times New Roman","Georgia",serif',
    mono: '"JetBrains Mono","Cascadia Code","Menlo","Consolas",monospace',
  };

  let mainView = "console";
  let chapters = [];
  let currentChapter = null;
  let chapterLoadToken = 0;

  const readerPrefs = loadReaderPrefs();
  applyReaderPrefs();

  function now() {
    const d = new Date();
    return d.toLocaleString();
  }

  function addMsg({ tag, tagClass, text, links }) {
    const el = document.createElement("div");
    el.className = "msg";
    el.innerHTML = `
      <div class="meta">
        <span class="tag ${tagClass || ""}">${escapeHtml(tag || "log")}</span>
        <span class="time">${escapeHtml(now())}</span>
      </div>
      <pre></pre>
    `;
    el.querySelector("pre").textContent = text || "";
    if (links && links.length) {
      const pre = el.querySelector("pre");
      pre.appendChild(document.createTextNode("\n"));
      for (const l of links) {
        const a = document.createElement("a");
        a.href = "#";
        a.textContent = l.label || l.path;
        a.addEventListener("click", (e) => {
          e.preventDefault();
          openFile(l.path);
        });
        pre.appendChild(a);
        pre.appendChild(document.createTextNode("\n"));
      }
    }
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function apiJson(path, opts) {
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return data;
  }

  async function apiSsePost(path, body, onEvent) {
    const res = await fetch(path + (path.includes("?") ? "&" : "?") + "stream=1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buf = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const evt = parseSseChunk(chunk);
        if (evt) onEvent(evt);
      }
    }
  }

  function parseSseChunk(chunk) {
    const lines = chunk.split("\n");
    let event = "message";
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice("event:".length).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trim());
    }
    if (!dataLines.length) return null;
    const dataRaw = dataLines.join("\n");
    let data = dataRaw;
    try {
      data = JSON.parse(dataRaw);
    } catch {}
    return { event, data };
  }

  function setMode(mode) {
    if (mode === "setup") {
      modeSetupBtn.classList.add("active");
      modeChapterBtn.classList.remove("active");
      setupPanel.classList.remove("hidden");
      chapterPanel.classList.add("hidden");
      return;
    }
    modeChapterBtn.classList.add("active");
    modeSetupBtn.classList.remove("active");
    chapterPanel.classList.remove("hidden");
    setupPanel.classList.add("hidden");
  }

  modeSetupBtn.addEventListener("click", () => setMode("setup"));
  modeChapterBtn.addEventListener("click", () => setMode("chapter"));

  function setMainView(view) {
    mainView = view;
    if (view === "console") {
      consoleTab.classList.add("active");
      readerTab.classList.remove("active");
      consoleView.classList.remove("hidden");
      readerView.classList.add("hidden");
      return;
    }
    readerTab.classList.add("active");
    consoleTab.classList.remove("active");
    readerView.classList.remove("hidden");
    consoleView.classList.add("hidden");
    if (!currentChapter && chapters.length) {
      loadChapter(chapters[0]).catch(errToChat);
    } else if (!chapters.length) {
      setReaderStatus("没有章节可读。");
    }
  }

  consoleTab.addEventListener("click", () => setMainView("console"));
  readerTab.addEventListener("click", () => {
    setMainView("reader");
    if (!chapters.length) refreshState({ silent: true }).catch(errToChat);
  });

  async function refreshState(opts = {}) {
    const state = await apiJson("/api/state");
    $("connInfo").textContent = `已连接 · ${state.novelRoot}`;
    setChapterList(state.chapters || []);
    if (!opts.silent) addMsg({ tag: "state", tagClass: "ok", text: JSON.stringify(state, null, 2) });
    return state;
  }

  async function refreshFiles() {
    const data = await apiJson("/api/files");
    const list = $("fileList");
    list.innerHTML = "";
    for (const p of data.files) {
      const el = document.createElement("div");
      el.className = "file-item";
      el.innerHTML = `<div class="file-path"></div><div class="file-meta">‘%"†¬?</div>`;
      el.querySelector(".file-path").textContent = p;
      el.addEventListener("click", () => openFile(p));
      list.appendChild(el);
    }
  }

  async function openFile(p) {
    const data = await apiJson(`/api/file?path=${encodeURIComponent(p)}`);
    editorPath.textContent = data.path;
    editorContent.value = data.content;
    editor.showModal();
  }

  saveFile.addEventListener("click", async () => {
    const p = editorPath.textContent;
    await apiJson("/api/file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: p, content: editorContent.value }),
    });
    addMsg({ tag: "file", tagClass: "ok", text: `†úý„¨?†-~‹¬s${p}` });
    await refreshFiles();
  });

  $("refreshFiles").addEventListener("click", () => refreshFiles().catch(errToChat));
  $("refreshState").addEventListener("click", () => refreshState().catch(errToChat));

  function errToChat(error) {
    addMsg({ tag: "error", tagClass: "bad", text: String(error?.message || error) });
  }

  function collectSetupBody() {
    const reqs = $("setupRequirements").value || "";
    const files = [];
    if ($("genBible").checked) files.push("bible.md");
    if ($("genCharacters").checked) files.push("characters.md");
    if ($("genOutline").checked) files.push("outline.md");
    if ($("genContinuity").checked) files.push("continuity_log.md");

    const models = {};
    const def = $("setupModelDefault").value.trim();
    const per = {
      "bible.md": $("setupModelBible").value.trim(),
      "characters.md": $("setupModelCharacters").value.trim(),
      "outline.md": $("setupModelOutline").value.trim(),
      "continuity_log.md": $("setupModelContinuity").value.trim(),
    };
    for (const k of Object.keys(per)) {
      if (per[k]) models[k] = per[k];
      else if (def) models[k] = def;
    }

    return {
      requirements: reqs,
      files,
      models,
      writeMode: $("setupWriteMode").value,
    };
  }

  $("runSetup").addEventListener("click", async () => {
    const body = collectSetupBody();
    addMsg({ tag: "setup", tagClass: "ok", text: `†¬?†<‡"Y‘^?‹¬s${body.files.join(", ") || "(‚¯~Šr†>>„,¦)"}\nwriteMode=${body.writeMode}` });

    try {
      await apiSsePost("/api/generate-setup", body, (evt) => {
        if (evt.event === "status") {
          addMsg({ tag: "status", text: JSON.stringify(evt.data) });
          return;
        }
        if (evt.event === "result") {
          addMsg({ tag: "wrote", tagClass: "ok", text: JSON.stringify(evt.data) });
          refreshFiles().catch(() => {});
          return;
        }
        if (evt.event === "done") {
          const outputs = evt.data?.outputs || {};
          const links = Object.keys(outputs).map((k) => ({ path: toRel(outputs[k].path) }));
          addMsg({
            tag: "done",
            tagClass: "ok",
            text: `runId=${evt.data.runId}\n${Object.keys(outputs).length} files`,
            links,
          });
          refreshFiles().catch(() => {});
          return;
        }
        if (evt.event === "error") {
          errToChat(new Error(evt.data?.error || "unknown error"));
          return;
        }
        addMsg({ tag: evt.event, text: JSON.stringify(evt.data, null, 2) });
      });
    } catch (e) {
      errToChat(e);
    }
  });

  function collectChapterBody() {
    const models = {};
    if ($("modelSummary").value.trim()) models.summary = $("modelSummary").value.trim();
    if ($("modelBrief").value.trim()) models.brief = $("modelBrief").value.trim();
    if ($("modelWrite").value.trim()) models.write = $("modelWrite").value.trim();
    if ($("modelQc").value.trim()) models.qc = $("modelQc").value.trim();
    if ($("modelUpdate").value.trim()) models.update = $("modelUpdate").value.trim();

    const cnRaw = $("chapterNumber").value.trim();
    const cn = cnRaw ? Number(cnRaw) : null;

    return {
      userGuidance: $("chapterGuidance").value || "",
      chapterNumber: Number.isFinite(cn) ? cn : null,
      models,
      mainWriteMode: $("mainWriteMode").value,
    };
  }

  $("runChapter").addEventListener("click", async () => {
    const body = collectChapterBody();
    addMsg({ tag: "chapter", tagClass: "ok", text: `†¬?†<†+T„«o‹¬schapterNumber=${body.chapterNumber ?? "(auto)"}\nmainWriteMode=${body.mainWriteMode}` });

    try {
      await apiSsePost("/api/develop-chapter", body, (evt) => {
        if (evt.event === "status") {
          addMsg({ tag: "status", text: JSON.stringify(evt.data) });
          return;
        }
        if (evt.event === "result") {
          addMsg({ tag: "wrote", tagClass: "ok", text: JSON.stringify(evt.data) });
          refreshFiles().catch(() => {});
          return;
        }
        if (evt.event === "done") {
          const outputs = evt.data?.outputs || {};
          const links = [];
          if (outputs.chapterBrief) links.push({ path: toRel(outputs.chapterBrief) });
          if (outputs.chapter) links.push({ path: toRel(outputs.chapter) });
          if (outputs.chapterQc) links.push({ path: toRel(outputs.chapterQc) });
          if (outputs.summary) links.push({ path: toRel(outputs.summary) });
          const main = outputs.mainUpdates || {};
          for (const k of Object.keys(main)) {
            if (main[k]?.path) links.push({ path: toRel(main[k].path) });
          }
          addMsg({
            tag: "done",
            tagClass: "ok",
            text: `runId=${evt.data.runId}\nchapter=${outputs.chapterNumber}`,
            links,
          });
          refreshFiles().catch(() => {});
          return;
        }
        if (evt.event === "error") {
          errToChat(new Error(evt.data?.error || "unknown error"));
          return;
        }
        addMsg({ tag: evt.event, text: JSON.stringify(evt.data, null, 2) });
      });
    } catch (e) {
      errToChat(e);
    }
  });

  function setChapterList(list) {
    chapters = Array.isArray(list) ? [...list].sort((a, b) => a - b) : [];
    if (!chapterSelect) return;

    chapterSelect.innerHTML = "";
    if (!chapters.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "暂无章节";
      opt.disabled = true;
      opt.selected = true;
      chapterSelect.appendChild(opt);
      chapterSelect.disabled = true;
      currentChapter = null;
      updateChapterNavButtons();
      readerTitle.textContent = "选择章节开始阅读";
      readerMeta.textContent = "";
      readerBody.classList.add("hidden");
      setReaderStatus("没有章节可读。");
      return;
    }

    chapterSelect.disabled = false;
    for (const n of chapters) {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = `第 ${n} 章`;
      chapterSelect.appendChild(opt);
    }

    const hasCurrent = currentChapter != null && chapters.includes(currentChapter);
    const target = hasCurrent ? currentChapter : chapters[0];
    chapterSelect.value = String(target);
    if (!hasCurrent) currentChapter = null;

    if (mainView === "reader" && currentChapter == null && target != null) {
      loadChapter(target).catch(errToChat);
    } else {
      updateChapterNavButtons();
      if (!currentChapter) setReaderStatus("选择章节后开始阅读。");
    }
  }

  function updateChapterNavButtons() {
    const idx = currentChapter == null ? -1 : chapters.indexOf(currentChapter);
    if (prevChapterBtn) prevChapterBtn.disabled = idx <= 0;
    if (nextChapterBtn) nextChapterBtn.disabled = idx === -1 || idx >= chapters.length - 1;
  }

  function setReaderStatus(text) {
    if (!readerStatus) return;
    readerStatus.textContent = text || "";
    readerStatus.classList.toggle("hidden", !text);
  }

  function chapterPath(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "";
    return `chapters/chapter_${String(num).padStart(2, "0")}.md`;
  }

  function renderChapterContent(markdown) {
    const blocks = String(markdown || "").split(/\n{2,}/);
    const html = [];
    for (const raw of blocks) {
      const block = raw.trim();
      if (!block) continue;
      const headingMatch = /^#{1,6}\s+(.+)$/.exec(block);
      if (headingMatch) {
        const hashes = block.match(/^#+/)?.[0].length || 1;
        const level = Math.min(3, hashes);
        html.push(`<h${level}>${escapeHtml(headingMatch[1].trim())}</h${level}>`);
        continue;
      }
      const lines = block.split("\n");
      const bullet = lines.every((ln) => ln.trim().startsWith("- "));
      if (bullet) {
        const items = lines
          .map((ln) => ln.trim().replace(/^-+\s*/, ""))
          .map((text) => `<li>${escapeHtml(text)}</li>`)
          .join("");
        html.push(`<ul>${items}</ul>`);
        continue;
      }
      html.push(`<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`);
    }
    return html.join("\n");
  }

  async function loadChapter(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return;
    const token = ++chapterLoadToken;

    currentChapter = num;
    if (chapterSelect) chapterSelect.value = String(num);
    updateChapterNavButtons();
    readerTitle.textContent = `第 ${num} 章`;
    readerMeta.textContent = "";
    setReaderStatus(`正在加载第 ${String(num).padStart(2, "0")} 章...`);
    readerBody.classList.add("hidden");
    readerBody.innerHTML = "";

    try {
      const data = await apiJson(`/api/file?path=${encodeURIComponent(chapterPath(num))}`);
      if (token !== chapterLoadToken) return;
      const content = data.content || "";
      const html = renderChapterContent(content);
      readerBody.innerHTML = html || `<p>${escapeHtml("暂无正文内容。")}</p>`;
      readerBody.classList.remove("hidden");
      const charCount = content.replace(/\s+/g, "").length;
      readerMeta.textContent = `${charCount} 字 · 共 ${chapters.length} 章`;
      setReaderStatus("");
    } catch (error) {
      if (token !== chapterLoadToken) return;
      setReaderStatus(`加载失败：${error?.message || error}`);
    }
  }

  function loadReaderPrefs() {
    try {
      const font = localStorage.getItem("readerFont") || "serif";
      const sizeRaw = Number(localStorage.getItem("readerFontSize"));
      const size = clampFontSize(Number.isFinite(sizeRaw) ? sizeRaw : 18);
      return { font, size };
    } catch {
      return { font: "serif", size: 18 };
    }
  }

  function clampFontSize(v) {
    if (!Number.isFinite(v)) return 18;
    return Math.min(28, Math.max(14, v));
  }

  function applyReaderPrefs() {
    const fontKey = readerFonts[readerPrefs.font] ? readerPrefs.font : "serif";
    readerPrefs.font = fontKey;
    readerPrefs.size = clampFontSize(readerPrefs.size);
    document.documentElement.style.setProperty("--reader-font", readerFonts[fontKey]);
    document.documentElement.style.setProperty("--reader-font-size", `${readerPrefs.size}px`);
    if (readerFont) readerFont.value = fontKey;
    if (readerFontSize) readerFontSize.value = readerPrefs.size;
    if (readerFontSizeValue) readerFontSizeValue.textContent = `${readerPrefs.size}px`;
  }

  function persistReaderPrefs() {
    try {
      localStorage.setItem("readerFont", readerPrefs.font);
      localStorage.setItem("readerFontSize", String(readerPrefs.size));
    } catch {}
  }

  if (chapterSelect) {
    chapterSelect.addEventListener("change", () => {
      const n = Number(chapterSelect.value);
      if (Number.isFinite(n)) loadChapter(n).catch(errToChat);
    });
  }

  if (prevChapterBtn) {
    prevChapterBtn.addEventListener("click", () => {
      const idx = currentChapter == null ? -1 : chapters.indexOf(currentChapter);
      if (idx > 0) loadChapter(chapters[idx - 1]).catch(errToChat);
    });
  }

  if (nextChapterBtn) {
    nextChapterBtn.addEventListener("click", () => {
      const idx = currentChapter == null ? -1 : chapters.indexOf(currentChapter);
      if (idx !== -1 && idx < chapters.length - 1) loadChapter(chapters[idx + 1]).catch(errToChat);
    });
  }

  if (refreshChaptersBtn) {
    refreshChaptersBtn.addEventListener("click", () => {
      refreshState({ silent: true }).catch(errToChat);
    });
  }

  if (readerFont) {
    readerFont.addEventListener("change", () => {
      readerPrefs.font = readerFont.value;
      applyReaderPrefs();
      persistReaderPrefs();
    });
  }

  if (readerFontSize) {
    readerFontSize.addEventListener("input", () => {
      readerPrefs.size = clampFontSize(Number(readerFontSize.value));
      applyReaderPrefs();
      persistReaderPrefs();
    });
  }

  function toRel(absOrRel) {
    // server returns absolute paths on Windows; best-effort for /api/file which expects relative.
    const s = String(absOrRel || "");
    const core = ["bible.md", "characters.md", "outline.md", "continuity_log.md"];
    for (const f of core) {
      if (s.toLowerCase().endsWith("\\" + f) || s.toLowerCase().endsWith("/" + f)) return f;
    }
    const idx = s.lastIndexOf("chapters\\");
    if (idx !== -1) return s.slice(idx).replaceAll("\\", "/");
    const idx2 = s.lastIndexOf("drafts\\");
    if (idx2 !== -1) return s.slice(idx2).replaceAll("\\", "/");
    const idx3 = s.lastIndexOf("runs\\");
    if (idx3 !== -1) return s.slice(idx3).replaceAll("\\", "/");
    const md = s.endsWith(".md") || s.endsWith(".json");
    if (md && !s.includes(":")) return s.replaceAll("\\", "/");
    return s.replaceAll("\\", "/");
  }

  // boot
  setMode("setup");
  setMainView("console");
  refreshState().catch(() => {});
  refreshFiles().catch(() => {});
})();

let notesData = [];
let flashcardsData = [];
let currentPaper = 1;
let currentUnit = "ALL";
let currentNoteId = null;
let searchQuery = "";

// State
let completedNotes = JSON.parse(localStorage.getItem('completedNotes') || '[]');
let bookmarkedNotes = JSON.parse(localStorage.getItem('bookmarkedNotes') || '[]');
let bookmarksOnlyFilter = false;
let valueAddOnlyFilter = false;
let currentTheme = localStorage.getItem('theme') || 'light';

// Flashcard State
let flashcardIndex = 0;
let isFlashcardMode = false;
let currentFlashcardUnit = "ALL";
let filteredFlashcards = [];

// Text-to-Speech (TTS) State
let speechUtterance = null;
let isSpeaking = false;
let isSpeechPaused = false;
let currentSpeechRate = 1.0;

// Pomodoro State
let pomoTime = 25 * 60;
let pomoInterval = null;
let pomoIsRunning = false;

// DOM Elements
const sidebarNav = document.getElementById('sidebar-nav');
const contentContainer = document.getElementById('content-container');
const flashcardContainer = document.getElementById('flashcard-container');
const btnPaper1 = document.getElementById('btn-paper1');
const btnPaper2 = document.getElementById('btn-paper2');
const unitSelect = document.getElementById('unit-select');
const btnComplete = document.getElementById('btn-complete');
const noteToolbar = document.getElementById('note-toolbar');

/* --- MATH PREPROCESSOR FOR MARKDOWN --- */
function parseMarkdownWithMath(content) {
    if (!content) return "";
    const mathBlocks = [];
    let placeholderCounter = 0;

    // 1. Extract block math $$...$$
    let tempContent = content.replace(/\$\$([\s\S]+?)\$\$/g, (match, math) => {
        const placeholder = `QQQMATHPLACEHOLDER_${placeholderCounter}QQQ`;
        mathBlocks.push({ placeholder, math: `$$${math}$$` });
        placeholderCounter++;
        return placeholder;
    });

    // 2. Extract inline math $...$
    tempContent = tempContent.replace(/\$([^\$\n]+?)\$/g, (match, math) => {
        const placeholder = `QQQMATHPLACEHOLDER_${placeholderCounter}QQQ`;
        mathBlocks.push({ placeholder, math: `$${math}$` });
        placeholderCounter++;
        return placeholder;
    });

    // 3. Parse with marked
    let html = marked.parse(tempContent);

    // 4. Restore math blocks
    mathBlocks.forEach(item => {
        html = html.replace(item.placeholder, item.math);
    });

    return html;
}

// Initialize
async function init() {
    applyTheme(currentTheme);
    document.getElementById('theme-select').value = currentTheme;
    updateProgressUI();
    updatePomoDisplay();

    try {
        const resNotes = await fetch('data.json');
        notesData = await resNotes.json();
        
        const resCards = await fetch('flashcards.json');
        flashcardsData = await resCards.json();

        updateUnitDropdown();
        updateFlashcardUnitDropdown();
        renderSidebar();
        mermaid.initialize({ startOnLoad: false, theme: currentTheme === 'dark' ? 'dark' : 'default' });
    } catch (e) {
        contentContainer.innerHTML = `<div class="empty-state"><h1>Failed to load data. Please ensure the server is running.</h1></div>`;
    }
}

/* --- THEME LOGIC --- */
function changeTheme() {
    currentTheme = document.getElementById('theme-select').value;
    localStorage.setItem('theme', currentTheme);
    applyTheme(currentTheme);
    mermaid.initialize({ startOnLoad: false, theme: currentTheme === 'dark' ? 'dark' : 'default' });
}
function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
}

/* --- PROGRESS LOGIC --- */
function toggleComplete() {
    if (!currentNoteId) return;
    if (completedNotes.includes(currentNoteId)) {
        completedNotes = completedNotes.filter(id => id !== currentNoteId);
    } else {
        completedNotes.push(currentNoteId);
    }
    localStorage.setItem('completedNotes', JSON.stringify(completedNotes));
    updateCompleteBtn();
    updateProgressUI();
    renderSidebar(); // Update checkmarks
}
function updateCompleteBtn() {
    if (!btnComplete) return;
    if (!currentNoteId) {
        btnComplete.style.display = 'none';
        return;
    }
    btnComplete.style.display = 'flex';
    if (completedNotes.includes(currentNoteId)) {
        btnComplete.innerHTML = `<span class="check-icon" style="color: #22C55E;">✓</span> Completed`;
        btnComplete.classList.add('active');
    } else {
        btnComplete.innerHTML = `<span class="check-icon">✓</span> Mark Completed`;
        btnComplete.classList.remove('active');
    }
}
function updateProgressUI() {
    const total = notesData.length || 22;
    const completed = completedNotes.length;
    document.getElementById('progress-count').textContent = completed;
    document.getElementById('total-count').textContent = total;
    const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
    document.getElementById('progress-fill').style.width = pct + '%';
}

/* --- POMODORO LOGIC --- */
function updatePomoDisplay() {
    const m = Math.floor(pomoTime / 60).toString().padStart(2, '0');
    const s = (pomoTime % 60).toString().padStart(2, '0');
    document.getElementById('pomo-time').textContent = `${m}:${s}`;
}
function startPomodoro() {
    if (pomoIsRunning) return;
    pomoIsRunning = true;
    pomoInterval = setInterval(() => {
        if (pomoTime > 0) {
            pomoTime--;
            updatePomoDisplay();
        } else {
            clearInterval(pomoInterval);
            pomoIsRunning = false;
            alert("Pomodoro Complete! Take a 5 minute break.");
            pomoTime = 5 * 60; // Set to break
            updatePomoDisplay();
        }
    }, 1000);
}
function pausePomodoro() {
    clearInterval(pomoInterval);
    pomoIsRunning = false;
}
function resetPomodoro() {
    pausePomodoro();
    pomoTime = 25 * 60;
    updatePomoDisplay();
}

/* --- BOOKMARKS & QUICK FILTER --- */
function toggleBookmark() {
    if (!currentNoteId) return;
    if (bookmarkedNotes.includes(currentNoteId)) {
        bookmarkedNotes = bookmarkedNotes.filter(id => id !== currentNoteId);
    } else {
        bookmarkedNotes.push(currentNoteId);
    }
    localStorage.setItem('bookmarkedNotes', JSON.stringify(bookmarkedNotes));
    updateBookmarkBtn();
    renderSidebar(); // Update star counts or visual markers
}

function updateBookmarkBtn() {
    const btn = document.getElementById('btn-bookmark');
    if (!btn) return;
    if (!currentNoteId) {
        btn.style.display = 'none';
        return;
    }
    btn.style.display = 'flex';
    if (bookmarkedNotes.includes(currentNoteId)) {
        btn.innerHTML = `<span class="star-icon" style="color: #FBBF24;">★</span> Bookmarked`;
        btn.classList.add('active');
    } else {
        btn.innerHTML = `<span class="star-icon">☆</span> Bookmark`;
        btn.classList.remove('active');
    }
}

function toggleBookmarksOnlyFilter() {
    bookmarksOnlyFilter = !bookmarksOnlyFilter;
    
    // Turn off Value Add filter if active to prevent clashing empty view
    if (bookmarksOnlyFilter && valueAddOnlyFilter) {
        valueAddOnlyFilter = false;
        const addBtn = document.getElementById('btn-valueadd-filter');
        const addMobBtn = document.getElementById('mobile-valueadd-indicator');
        if (addBtn) addBtn.classList.remove('active');
        if (addMobBtn) addMobBtn.classList.remove('active');
    }
    
    const btn = document.getElementById('btn-bookmarks-filter');
    const mobBtn = document.getElementById('mobile-bookmark-indicator');
    
    if (btn) btn.classList.toggle('active', bookmarksOnlyFilter);
    if (mobBtn) mobBtn.classList.toggle('active', bookmarksOnlyFilter);
    
    renderSidebar();
}

function toggleValueAddFilter() {
    valueAddOnlyFilter = !valueAddOnlyFilter;
    
    // Turn off Bookmarks filter if active to prevent clashing empty view
    if (valueAddOnlyFilter && bookmarksOnlyFilter) {
        bookmarksOnlyFilter = false;
        const bookBtn = document.getElementById('btn-bookmarks-filter');
        const bookMobBtn = document.getElementById('mobile-bookmark-indicator');
        if (bookBtn) bookBtn.classList.remove('active');
        if (bookMobBtn) bookMobBtn.classList.remove('active');
    }
    
    const btn = document.getElementById('btn-valueadd-filter');
    const mobBtn = document.getElementById('mobile-valueadd-indicator');
    
    if (btn) btn.classList.toggle('active', valueAddOnlyFilter);
    if (mobBtn) mobBtn.classList.toggle('active', valueAddOnlyFilter);
    
    renderSidebar();
}

/* --- NAVIGATION & FILTER LOGIC --- */
function updateUnitDropdown() {
    unitSelect.innerHTML = '<option value="ALL">All Units</option>';
    const allUnits = new Set();
    notesData.forEach(n => {
        if (n.paper === currentPaper && n.units) n.units.forEach(u => allUnits.add(u));
    });
    Array.from(allUnits).sort().forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = `${currentPaper === 1 ? "Paper I" : "Paper II"} | ${u}`;
        unitSelect.appendChild(opt);
    });
    currentUnit = "ALL";
    unitSelect.value = "ALL";
}

function filterPaper(num) {
    currentPaper = num;
    btnPaper1.classList.toggle('active', num === 1);
    btnPaper2.classList.toggle('active', num === 2);
    updateUnitDropdown();
    renderSidebar();
}
function filterUnit() {
    currentUnit = unitSelect.value;
    renderSidebar();
}

function handleSearch() {
    searchQuery = document.getElementById('search-input').value.toLowerCase();
    renderSidebar();
}

function renderSidebar() {
    sidebarNav.innerHTML = '';
    let filteredNotes = [];
    
    if (searchQuery.trim() !== "") {
        // Global search overrides paper and unit filters
        filteredNotes = notesData.filter(n => 
            n.title.toLowerCase().includes(searchQuery) || 
            (n.content && n.content.toLowerCase().includes(searchQuery))
        );
    } else {
        filteredNotes = notesData.filter(n => n.paper === currentPaper);
        if (currentUnit !== "ALL") {
            filteredNotes = filteredNotes.filter(n => n.units && n.units.includes(currentUnit));
        }
    }
    
    // Filter by Value Addition flag
    if (valueAddOnlyFilter) {
        filteredNotes = filteredNotes.filter(n => n.value_add === true);
    } else {
        filteredNotes = filteredNotes.filter(n => !n.value_add);
    }
    
    // Apply Bookmarks filter
    if (bookmarksOnlyFilter) {
        filteredNotes = filteredNotes.filter(n => bookmarkedNotes.includes(n.id));
    }
    
    if (filteredNotes.length === 0) {
        sidebarNav.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary); font-size: 0.9rem;">No results found.</div>';
        return;
    }

    filteredNotes.forEach(note => {
        const div = document.createElement('div');
        div.className = 'nav-item';
        if (note.id === currentNoteId) div.classList.add('active');
        div.onclick = () => loadNote(note);
        
        const isDone = completedNotes.includes(note.id) ? "✅ " : "";
        const isBookmarked = bookmarkedNotes.includes(note.id) ? "⭐ " : "";
        div.innerHTML = `
            <div class="nav-title">${isDone}${isBookmarked}${note.title}</div>
            <div class="nav-meta">${note.units ? note.units.join(', ') : ''}</div>
        `;
        sidebarNav.appendChild(div);
    });
}

function loadNote(note) {
    if (isFlashcardMode) toggleFlashcards(); // Exit flashcard mode if clicking a note
    
    // Stop any active audio narration when changing notes
    stopAudio();
    document.getElementById('audio-player-container').style.display = 'none';
    
    currentNoteId = note.id;
    noteToolbar.style.display = 'flex';
    
    updateCompleteBtn();
    updateBookmarkBtn();
    renderSidebar(); // highlight active

    let html = parseMarkdownWithMath(note.content);
    html = html.replace(/<blockquote>\s*<p>\[!(TIP|NOTE|IMPORTANT|WARNING|CAUTION)\]([\s\S]*?)<\/p>\s*<\/blockquote>/gi, (match, type, content) => {
        let title = "Context", css = "alert-note";
        if (type === "TIP") { title = "Mnemonic / Strategy"; css = "alert-tip"; }
        if (type === "NOTE") { title = "Context / Background"; css = "alert-note"; }
        if (type === "IMPORTANT" || type === "WARNING" || type === "CAUTION") { title = "Important Note"; css = "alert-important"; }
        return `<div class="alert-block ${css}"><div class="alert-title">${title}</div><div class="alert-content">${content}</div></div>`;
    });
    html = html.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/gi, '<div class="mermaid">$1</div>');
    
    contentContainer.innerHTML = html;
    contentContainer.scrollTop = 0;
    
    // Auto-close sidebar on mobile after choosing a topic
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('active');
        document.getElementById('sidebar-overlay').classList.remove('active');
    }
    
    // Wrap tables in responsive .table-container
    const tables = contentContainer.querySelectorAll('table');
    tables.forEach(table => {
        const wrapper = document.createElement('div');
        wrapper.className = 'table-container';
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
    });

    // Wrap mermaid divs in responsive .mermaid-container
    const mermaids = contentContainer.querySelectorAll('.mermaid');
    mermaids.forEach(m => {
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-container';
        m.parentNode.insertBefore(wrapper, m);
        wrapper.appendChild(m);
    });

    try {
        renderMathInElement(contentContainer, {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$", right: "$", display: false},
                {left: "\\(", right: "\\)", display: false},
                {left: "\\[", right: "\\]", display: true}
            ],
            throwOnError: false
        });
    } catch(e) {
        console.error("KaTeX rendering error:", e);
    }
    
    try { mermaid.init(undefined, document.querySelectorAll('.mermaid')); } catch(e){}
}

/* --- TEXT-TO-SPEECH (TTS) NARRATOR --- */
function toggleSpeech() {
    const player = document.getElementById('audio-player-container');
    if (player.style.display === 'none') {
        player.style.display = 'flex';
        document.getElementById('btn-speak').classList.add('active');
        
        const activeNote = notesData.find(n => n.id === currentNoteId);
        document.getElementById('audio-note-title').textContent = activeNote ? activeNote.title : 'Active Note';
        playAudio();
    } else {
        stopAudio();
        player.style.display = 'none';
        document.getElementById('btn-speak').classList.remove('active');
    }
}

function getCleanTextForSpeech(htmlContent) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // Strip elements we don't want TTS to speak out
    const cleanSelectors = '.mermaid, pre, code, svg, script, style, .alert-title, th';
    tempDiv.querySelectorAll(cleanSelectors).forEach(el => el.remove());
    
    return tempDiv.innerText || tempDiv.textContent || "";
}

function playAudio() {
    const currentNote = notesData.find(n => n.id === currentNoteId);
    if (!currentNote) return;
    
    window.speechSynthesis.cancel(); // cancel any active queue
    
    const textToSpeak = getCleanTextForSpeech(parseMarkdownWithMath(currentNote.content));
    if (!textToSpeak.trim()) return;

    speechUtterance = new SpeechSynthesisUtterance(textToSpeak);
    speechUtterance.rate = currentSpeechRate;
    
    speechUtterance.onend = () => {
        isSpeaking = false;
        isSpeechPaused = false;
        updateAudioPlayerControls();
    };
    
    speechUtterance.onerror = (e) => {
        console.error("SpeechSynthesisUtterance error:", e);
        isSpeaking = false;
        isSpeechPaused = false;
        updateAudioPlayerControls();
    };
    
    window.speechSynthesis.speak(speechUtterance);
    isSpeaking = true;
    isSpeechPaused = false;
    updateAudioPlayerControls();
}

function pauseAudio() {
    if (isSpeaking && !isSpeechPaused) {
        window.speechSynthesis.pause();
        isSpeechPaused = true;
        updateAudioPlayerControls();
    }
}

function resumeAudio() {
    if (isSpeaking && isSpeechPaused) {
        window.speechSynthesis.resume();
        isSpeechPaused = false;
        updateAudioPlayerControls();
    } else if (!isSpeaking) {
        playAudio();
    }
}

function stopAudio() {
    window.speechSynthesis.cancel();
    isSpeaking = false;
    isSpeechPaused = false;
    updateAudioPlayerControls();
}

function changeAudioSpeed() {
    const speedSelect = document.getElementById('audio-speed');
    currentSpeechRate = parseFloat(speedSelect.value);
    if (isSpeaking) {
        playAudio(); // restart with new speed
    }
}

function updateAudioPlayerControls() {
    const playBtn = document.getElementById('btn-audio-play');
    const pauseBtn = document.getElementById('btn-audio-pause');
    
    if (isSpeaking && !isSpeechPaused) {
        playBtn.style.display = 'none';
        pauseBtn.style.display = 'inline-block';
        pauseBtn.textContent = 'Pause';
        pauseBtn.onclick = pauseAudio;
    } else if (isSpeaking && isSpeechPaused) {
        playBtn.style.display = 'inline-block';
        playBtn.textContent = 'Resume';
        playBtn.onclick = resumeAudio;
        pauseBtn.style.display = 'none';
    } else {
        playBtn.style.display = 'inline-block';
        playBtn.textContent = 'Play';
        playBtn.onclick = playAudio;
        pauseBtn.style.display = 'none';
    }
}

/* --- SYLLABUS PROGRESS DASHBOARD --- */
function toggleDashboard() {
    const dashboard = document.getElementById('dashboard-overlay');
    if (dashboard.style.display === 'none') {
        buildDashboard();
        dashboard.style.display = 'flex';
    } else {
        dashboard.style.display = 'none';
    }
}

function buildDashboard() {
    const total = notesData.length || 22;
    const completed = completedNotes.length;
    const overallPct = total === 0 ? 0 : Math.round((completed / total) * 100);
    
    // Overall completion text
    document.getElementById('dashboard-overall-pct').textContent = overallPct + '%';
    
    // Radial SVG offset: Stroke Circumference = 314.16. Offset = 314.16 * (1 - pct/100)
    const radialFill = document.getElementById('radial-fill');
    if (radialFill) {
        const offset = 314.16 * (1 - overallPct / 100);
        radialFill.style.strokeDashoffset = offset;
    }
    
    // Paper I Stats
    const p1Notes = notesData.filter(n => n.paper === 1);
    const p1Total = p1Notes.length;
    const p1Comp = p1Notes.filter(n => completedNotes.includes(n.id)).length;
    const p1Pct = p1Total === 0 ? 0 : Math.round((p1Comp / p1Total) * 100);
    document.getElementById('p1-comp-count').textContent = p1Comp;
    document.getElementById('p1-total-count').textContent = p1Total;
    document.getElementById('p1-bar-fill').style.width = p1Pct + '%';
    
    // Paper II Stats
    const p2Notes = notesData.filter(n => n.paper === 2);
    const p2Total = p2Notes.length;
    const p2Comp = p2Notes.filter(n => completedNotes.includes(n.id)).length;
    const p2Pct = p2Total === 0 ? 0 : Math.round((p2Comp / p2Total) * 100);
    document.getElementById('p2-comp-count').textContent = p2Comp;
    document.getElementById('p2-total-count').textContent = p2Total;
    document.getElementById('p2-bar-fill').style.width = p2Pct + '%';
    
    // Generate checklists grouped by Paper and Unit
    const unitsGrid = document.getElementById('dashboard-units-grid');
    unitsGrid.innerHTML = '';
    
    const paperUnits = { 'Paper I': {}, 'Paper II': {} };
    notesData.forEach(n => {
        const paperKey = n.paper === 1 ? 'Paper I' : 'Paper II';
        if (n.units) {
            n.units.forEach(u => {
                if (!paperUnits[paperKey][u]) paperUnits[paperKey][u] = [];
                paperUnits[paperKey][u].push(n);
            });
        }
    });
    
    for (const [paperName, unitsMap] of Object.entries(paperUnits)) {
        const sortedUnits = Object.keys(unitsMap).sort();
        sortedUnits.forEach(u => {
            const notes = unitsMap[u];
            const card = document.createElement('div');
            card.className = 'dashboard-unit-card';
            
            const title = document.createElement('div');
            title.className = 'dashboard-unit-title';
            title.textContent = `${paperName} — ${u}`;
            card.appendChild(title);
            
            notes.forEach(note => {
                const isDone = completedNotes.includes(note.id);
                const noteItem = document.createElement('div');
                noteItem.className = `dashboard-note-item ${isDone ? 'completed' : ''}`;
                
                const chk = document.createElement('input');
                chk.type = 'checkbox';
                chk.checked = isDone;
                chk.onchange = (e) => {
                    e.stopPropagation();
                    toggleDashboardComplete(note.id);
                };
                noteItem.appendChild(chk);
                
                const label = document.createElement('span');
                label.textContent = note.title;
                noteItem.appendChild(label);
                
                // Allow direct jumping to note from dashboard click
                noteItem.onclick = () => {
                    toggleDashboard();
                    loadNote(note);
                };
                
                card.appendChild(noteItem);
            });
            
            unitsGrid.appendChild(card);
        });
    }
}

function toggleDashboardComplete(noteId) {
    if (completedNotes.includes(noteId)) {
        completedNotes = completedNotes.filter(id => id !== noteId);
    } else {
        completedNotes.push(noteId);
    }
    localStorage.setItem('completedNotes', JSON.stringify(completedNotes));
    updateProgressUI();
    renderSidebar();
    if (currentNoteId === noteId) {
        updateCompleteBtn();
    }
    buildDashboard(); // Rebuild metrics
}

/* --- FLASHCARDS LOGIC --- */
function toggleFlashcards() {
    isFlashcardMode = !isFlashcardMode;
    const btn = document.getElementById('btn-flashcards');
    if (isFlashcardMode) {
        contentContainer.style.display = 'none';
        noteToolbar.style.display = 'none';
        document.getElementById('audio-player-container').style.display = 'none';
        flashcardContainer.style.display = 'flex';
        btn.textContent = "Exit Flashcards";
        btn.style.background = "#DC2626";
        flashcardIndex = 0;
        document.getElementById('fc-unit-select').value = currentFlashcardUnit;
        renderFlashcard();
    } else {
        contentContainer.style.display = 'block';
        if (currentNoteId) {
            noteToolbar.style.display = 'flex';
        }
        flashcardContainer.style.display = 'none';
        btn.textContent = "Flashcards";
        btn.style.background = "var(--accent-color)";
    }
}

function updateFlashcardUnitDropdown() {
    const fcSelect = document.getElementById('fc-unit-select');
    if (!fcSelect) return;
    fcSelect.innerHTML = '<option value="ALL">All Cards (Comprehensive)</option>';
    
    const activeUnits = new Set();
    flashcardsData.forEach(card => {
        const matchingNote = notesData.find(n => n.title === card.source_title);
        if (matchingNote && matchingNote.units) {
            matchingNote.units.forEach(u => activeUnits.add(u));
        }
    });
    
    Array.from(activeUnits).sort().forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = u;
        fcSelect.appendChild(opt);
    });
}

function filterFlashcardUnit() {
    currentFlashcardUnit = document.getElementById('fc-unit-select').value;
    flashcardIndex = 0;
    renderFlashcard();
}

function renderFlashcard() {
    if (currentFlashcardUnit === "ALL") {
        filteredFlashcards = flashcardsData;
    } else {
        filteredFlashcards = flashcardsData.filter(card => {
            const matchingNote = notesData.find(n => n.title === card.source_title);
            return matchingNote && matchingNote.units && matchingNote.units.includes(currentFlashcardUnit);
        });
    }
    
    if (!filteredFlashcards || filteredFlashcards.length === 0) {
        document.getElementById('fc-front').innerHTML = `<b>Deck Empty</b><br><br><span style="font-size:0.9rem;color:var(--text-secondary)">No active flashcards belong to this specific Syllabus Unit.</span>`;
        document.getElementById('fc-back').innerHTML = `Empty`;
        document.getElementById('fc-count').textContent = `0 / 0`;
        return;
    }

    if (flashcardIndex >= filteredFlashcards.length) {
        flashcardIndex = 0;
    }

    const card = filteredFlashcards[flashcardIndex];
    document.getElementById('fc-front').innerHTML = `<b>Topic:</b> ${card.source_title}<br><br><span style="font-size:0.9rem;color:var(--text-secondary)">Click to reveal ${card.type === 'TIP' ? 'mnemonic/tip' : 'important concept'}</span>`;
    let backHtml = parseMarkdownWithMath(card.content);
    const fcBack = document.getElementById('fc-back');
    fcBack.innerHTML = backHtml;
    
    try {
        renderMathInElement(fcBack, {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$", right: "$", display: false},
                {left: "\\(", right: "\\)", display: false},
                {left: "\\[", right: "\\]", display: true}
            ],
            throwOnError: false
        });
    } catch(e) {
        console.error("KaTeX flashcard rendering error:", e);
    }
    document.getElementById('fc-count').textContent = `${flashcardIndex + 1} / ${filteredFlashcards.length}`;
    document.querySelector('.flashcard').classList.remove('flipped');
}

function flipCard() { document.querySelector('.flashcard').classList.toggle('flipped'); }
function nextCard() { if (flashcardIndex < filteredFlashcards.length - 1) { flashcardIndex++; renderFlashcard(); } }
function prevCard() { if (flashcardIndex > 0) { flashcardIndex--; renderFlashcard(); } }

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
        sidebar.classList.remove('hidden');
    } else {
        sidebar.classList.toggle('hidden');
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    }
}

init();

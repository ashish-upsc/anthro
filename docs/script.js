let notesData = [];
let flashcardsData = [];
let currentPaper = 1;
let currentUnit = "ALL";
let currentNoteId = null;
let searchQuery = "";

// State
let completedNotes = JSON.parse(localStorage.getItem('completedNotes') || '[]');
let currentTheme = localStorage.getItem('theme') || 'light';
let flashcardIndex = 0;
let isFlashcardMode = false;

// Pomodoro State
let pomoTime = 25 * 60;
let pomoInterval = null;
let pomoIsRunning = false;

// DOM Elements
const sidebarNav = document.getElementById('sidebar-nav');
const contentContainer = document.getElementById('content-container');
const flashcardContainer = document.getElementById('flashcard-container');
const noteActions = document.getElementById('note-actions');
const btnPaper1 = document.getElementById('btn-paper1');
const btnPaper2 = document.getElementById('btn-paper2');
const unitSelect = document.getElementById('unit-select');
const btnComplete = document.getElementById('btn-complete');

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
    if (!currentNoteId) return;
    if (completedNotes.includes(currentNoteId)) {
        btnComplete.textContent = "Completed ✅ (Click to Undo)";
        btnComplete.style.background = "var(--accent-color)";
        btnComplete.style.color = "white";
    } else {
        btnComplete.textContent = "Mark as Completed ✅";
        btnComplete.style.background = "transparent";
        btnComplete.style.color = "var(--accent-color)";
    }
}
function updateProgressUI() {
    const total = notesData.length || 9;
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
        div.innerHTML = `
            <div class="nav-title">${isDone}${note.title}</div>
            <div class="nav-meta">${note.units ? note.units.join(', ') : ''}</div>
        `;
        sidebarNav.appendChild(div);
    });
}

function loadNote(note) {
    if (isFlashcardMode) toggleFlashcards(); // Exit flashcard mode if clicking a note
    currentNoteId = note.id;
    noteActions.style.display = 'block';
    updateCompleteBtn();
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

/* --- FLASHCARDS LOGIC --- */
function toggleFlashcards() {
    isFlashcardMode = !isFlashcardMode;
    const btn = document.getElementById('btn-flashcards');
    if (isFlashcardMode) {
        contentContainer.style.display = 'none';
        noteActions.style.display = 'none';
        flashcardContainer.style.display = 'flex';
        btn.textContent = "Exit Flashcards";
        btn.style.background = "#DC2626";
        flashcardIndex = 0;
        renderFlashcard();
    } else {
        contentContainer.style.display = 'block';
        if (currentNoteId) noteActions.style.display = 'block';
        flashcardContainer.style.display = 'none';
        btn.textContent = "Flashcards";
        btn.style.background = "var(--accent-color)";
    }
}
function renderFlashcard() {
    if (!flashcardsData || flashcardsData.length === 0) return;
    const card = flashcardsData[flashcardIndex];
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
    document.getElementById('fc-count').textContent = `${flashcardIndex + 1} / ${flashcardsData.length}`;
    document.querySelector('.flashcard').classList.remove('flipped');
}
function flipCard() { document.querySelector('.flashcard').classList.toggle('flipped'); }
function nextCard() { if (flashcardIndex < flashcardsData.length - 1) { flashcardIndex++; renderFlashcard(); } }
function prevCard() { if (flashcardIndex > 0) { flashcardIndex--; renderFlashcard(); } }

function toggleSidebar() { document.querySelector('.sidebar').classList.toggle('hidden'); }

init();

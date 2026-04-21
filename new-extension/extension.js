const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

let decorationTypes = new Map();
let keywordMap = {};
let soundMap = {};
let panel;

function activate(context) {
    console.log("activated");

    loadKeywords(context);
    loadSounds(context);
    const update = debounce(() => updateDecorations(context), 50);

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(update),
        vscode.window.onDidChangeActiveTextEditor(update)
    );

    // 🔊 WebView
    panel = vscode.window.createWebviewPanel(
        'soundPanel',
        'Sound Engine',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(context.extensionPath, 'media'))
            ]
        }
    );

    panel.webview.html = getWebviewContent(context);

    // 🧠 hover (оставил, но без звука)
    const hover = vscode.languages.registerHoverProvider('*', {
        provideHover(document, position) {
            const range = document.getWordRangeAtPosition(position);
            const word = document.getText(range);

            if (soundMap[word]) {
                panel.webview.postMessage({
                    type: 'sound',
                    name: word
                });
            } else {
                panel.webview.postMessage({ type: 'stop' });
            }
        }
    });

    context.subscriptions.push(hover);

    // 🔊 КЛИК = ЗВУК (твоя логика, встроена)
    let lastPlay = 0;

    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection((event) => {
            const editor = event.textEditor;
            if (!editor) return;

            if (event.kind !== vscode.TextEditorSelectionChangeKind.Mouse) return;

            const selection = editor.selection;
            const range = editor.document.getWordRangeAtPosition(selection.active);
            if (!range) return;

            const word = editor.document.getText(range);

            if (word === 'override') {
                console.log("playing sound??")
                const now = Date.now();
                if (now - lastPlay < 400) return;
                console.log("sending message")
                panel.webview.postMessage({ type: 'sound', name: 'override' });
                lastPlay = now;
            }
        })
    );

    update();
}

// 📦 JSON loader
function loadKeywords(context) {
    const jsonPath = path.join(context.extensionPath, 'media', 'keywords.json');
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    keywordMap = JSON.parse(raw);
}
function loadSounds(context) {
    const jsonPath = path.join(context.extensionPath, 'media', 'sounds.json');
    if (!fs.existsSync(jsonPath)) return;

    const raw = fs.readFileSync(jsonPath, 'utf-8');
    soundMap = JSON.parse(raw);
}
// 🎨 decoration cache
function getDecorationType(gifData) {
    if (decorationTypes.has(gifData)) {
        return decorationTypes.get(gifData);
    }

    const type = vscode.window.createTextEditorDecorationType({
        textDecoration: `
            none;
            background-image: url(${gifData});
            background-size: calc(100% + 6px) 150%;
            background-position: center;
            image-rendering: crisp-edges;
        `,
        color: 'transparent'
    });

    decorationTypes.set(gifData, type);
    return type;
}

// 🔁 GIF render
function updateDecorations(context) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const text = editor.document.getText();
    const grouped = new Map();

    for (const keyword in keywordMap) {
        const gifPath = path.join(context.extensionPath, 'media', keywordMap[keyword]);

        if (!fs.existsSync(gifPath)) continue;

        const gifBase64 = fs.readFileSync(gifPath).toString('base64');
        const gifData = `data:image/gif;base64,${gifBase64}`;

        const regex = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "g");

        let match;
        while ((match = regex.exec(text)) !== null) {
            const start = editor.document.positionAt(match.index);
            const end = editor.document.positionAt(match.index + keyword.length);

            const range = new vscode.Range(start, end);

            if (!grouped.has(gifData)) {
                grouped.set(gifData, []);
            }

            grouped.get(gifData).push({ range });
        }
    }

    for (const [gifData, decorations] of grouped.entries()) {
        const type = getDecorationType(gifData);
        editor.setDecorations(type, decorations);
    }
}

// 🔊 WebView
function getWebviewContent(context) {
    const audioUri = panel.webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'media', 'override.mp3'))
    );

    return `
    <!DOCTYPE html>
    <html>
    <body>
        <audio id="audio" src="${audioUri}" preload="auto"></audio>

        <button id="unlock" style="padding:8px 12px;">
            Click once to enable sound
        </button>

        <script>
            const audio = document.getElementById('audio');
            const unlockBtn = document.getElementById('unlock');
            let unlocked = false;

            async function unlockAudio() {
                try {
                    audio.volume = 0;
                    await audio.play();
                    audio.pause();
                    audio.currentTime = 0;
                    audio.volume = 1;
                    unlocked = true;
                    unlockBtn.textContent = 'Sound enabled';
                    unlockBtn.disabled = true;
                    console.log('audio unlocked');
                } catch (e) {
                    console.log('unlock failed', e);
                }
            }

            unlockBtn.addEventListener('click', unlockAudio);

            window.addEventListener('message', async (event) => {
                if (event.data.type === 'sound') {
                    if (!unlocked) return;

                    audio.currentTime = 0;
                    audio.play().catch(err => console.log('play error', err));
                }

                if (event.data.type === 'stop') {
                    audio.pause();
                    audio.currentTime = 0;
                }
            });
        </script>
    </body>
    </html>
    `;
}

// 🔧 regex escape
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ⏱ debounce
function debounce(fn, delay) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), delay);
    };
}

function deactivate() {}

module.exports = { activate, deactivate };
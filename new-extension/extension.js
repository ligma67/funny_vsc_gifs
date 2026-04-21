const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

let decorationTypes = new Map();
let keywordMap = {};
let soundMap = {};
let panel;
let lastWord = null;

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

    // 🎧 hover звук
    const hover = vscode.languages.registerHoverProvider('*', {
        provideHover(document, position) {
            const range = document.getWordRangeAtPosition(position);
            if (!range) return;

            const word = document.getText(range);

            if (soundMap[word]) {
                if (word === lastWord) return;
                lastWord = word;

                const soundUri = panel.webview.asWebviewUri(
                    vscode.Uri.file(
                        path.join(context.extensionPath, 'media', soundMap[word])
                    )
                );

                panel.webview.postMessage({
                    type: 'sound',
                    src: soundUri.toString()
                });

                return new vscode.Hover(`🎧 ${word}`);
            } else {
                lastWord = null;
                panel.webview.postMessage({ type: 'stop' });
            }
        }
    });

    context.subscriptions.push(hover);

    update();
}

// 📦 JSON загрузка
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

// 🎨 декорации (GIF)
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
    return `
    <!DOCTYPE html>
    <html>
    <body style="font-family:sans-serif; padding:10px;">
        <button id="unlockBtn">🔊 Enable sound</button>

        <script>
            let currentAudio = null;
            let unlocked = false;
            let fadeInterval = null;

            const btn = document.getElementById('unlockBtn');

            btn.addEventListener('click', async () => {
                try {
                    const temp = new Audio();
                    temp.src = "data:audio/mp3;base64,";
                    await temp.play().catch(()=>{});

                    unlocked = true;
                    btn.textContent = "✅ Sound enabled";
                    btn.disabled = true;
                } catch (e) {
                    console.log("unlock failed", e);
                }
            });

            // 💥 токен последнего hover
            let hoverToken = 0;

            function stopCurrentAudio() {
                if (fadeInterval) {
                    clearInterval(fadeInterval);
                    fadeInterval = null;
                }

                if (currentAudio) {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                    currentAudio = null;
                }
            }

            function playSound(src, token) {
                if (!unlocked) return;

                // 💥 если уже пришёл новый hover — игнор старый
                if (token !== hoverToken) return;

                stopCurrentAudio();

                currentAudio = new Audio(src);
                currentAudio.volume = 1;

                currentAudio.play().catch(() => {});
            }

            function fadeOut() {
                if (!currentAudio) return;

                if (fadeInterval) clearInterval(fadeInterval);

                fadeInterval = setInterval(() => {
                    if (!currentAudio) {
                        clearInterval(fadeInterval);
                        fadeInterval = null;
                        return;
                    }

                    if (currentAudio.volume > 0.05) {
                        currentAudio.volume -= 0.05;
                    } else {
                        stopCurrentAudio();
                    }
                }, 30);
            }

            window.addEventListener('message', (event) => {
                if (event.data.type === 'sound') {

                    // 💥 новый hover = новый токен
                    hoverToken++;

                    const myToken = hoverToken;

                    setTimeout(() => {
                        playSound(event.data.src, myToken);
                    }, 30); // лёгкий debounce
                }

                if (event.data.type === 'stop') {
                    fadeOut();
                }
            });
        </script>
    </body>
    </html>
    `;
}

// 🔧 utils
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function debounce(fn, delay) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), delay);
    };
}

function deactivate() {}

module.exports = { activate, deactivate };
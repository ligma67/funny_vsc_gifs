const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

let decorationTypes = new Map();
let keywordMap = {};

function activate(context) {
    console.log("activated");

    loadKeywords(context);

    const update = debounce(() => updateDecorations(context), 50);

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(() => update()),
        vscode.window.onDidChangeActiveTextEditor(() => update())
    );

    update();
}

// 📦 загрузка JSON
function loadKeywords(context) {
    const jsonPath = path.join(context.extensionPath, 'media', 'keywords.json');
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    keywordMap = JSON.parse(raw);
}

// 🎨 кеш декораций (чтобы не пересоздавать)
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

// 🔁 основной рендер
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

    // применяем декорации
    for (const [gifData, decorations] of grouped.entries()) {
        const type = getDecorationType(gifData);
        editor.setDecorations(type, decorations);
    }
}

// 🔧 защита regex
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ⏱ debounce (оставил твой)
function debounce(fn, delay) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), delay);
    };
}

function deactivate() {}

module.exports = { activate, deactivate };
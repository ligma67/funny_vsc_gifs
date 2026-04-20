const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

let decorationType;

function activate(context) {
    console.log("activated");

    const gifPath = path.join(context.extensionPath, 'media', 'tenor.gif');
    const gifBase64 = fs.readFileSync(gifPath).toString('base64');
    const gifData = `data:image/gif;base64,${gifBase64}`;

    decorationType = vscode.window.createTextEditorDecorationType({
		textDecoration: `
    none;
    background-image: url(${gifData});
    background-size: calc(100% + 6px) 150%;
    background-position: center;
	
	image-rendering: crisp-edges;
`,
		color: 'transparent' // прячем текст, чтобы была видна только гифка
	});

    const update = debounce(updateDecorations, 50);

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(() => update()),
        vscode.window.onDidChangeActiveTextEditor(() => update())
    );

    update();
}

function updateDecorations() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const text = editor.document.getText();
    const regex = /\boverride\b/g;

    const decorations = [];

    let match;
    while ((match = regex.exec(text)) !== null) {
        const start = editor.document.positionAt(match.index);
        const end = editor.document.positionAt(match.index + match[0].length);

        const range = new vscode.Range(start, end);

        decorations.push({
            range
        });
    }

    editor.setDecorations(decorationType, decorations);
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
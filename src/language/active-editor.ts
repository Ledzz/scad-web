// The Monaco editor the Help panel inserts into (set by EditorPanel on mount).

import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

let activeEditor: monaco.editor.IStandaloneCodeEditor | null = null;

export function setActiveEditor(editor: monaco.editor.IStandaloneCodeEditor) {
  activeEditor = editor;
}

/** A snippet as plain text: tab stops become their default text. */
export function snippetText(snippet: string) {
  return snippet.replace(/\$\{\d+:([^}]*)\}/g, '$1').replace(/\$\{\d+\}|\$\d+/g, '').replace(/\\\$/g, '$');
}

/** Insert a Monaco snippet (with tab stops) at the cursor; false if there is no Monaco editor. */
export function insertSnippet(snippet: string): boolean {
  if (!activeEditor) return false;
  activeEditor.focus();
  const controller = activeEditor.getContribution('snippetController2') as {insert(template: string): void} | null;
  if (controller) {
    controller.insert(snippet);
  } else {
    activeEditor.trigger('help', 'type', {text: snippetText(snippet)});
  }
  return true;
}

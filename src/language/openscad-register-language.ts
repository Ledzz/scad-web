// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import loader from '@monaco-editor/loader';
import { ZipArchives } from '../fs/zip-archives';
import { buildOpenSCADCompletionItemProvider } from './openscad-completions';
import openscadLanguage from './openscad-language';
import { cheatsheetByName, manualUrl } from '../help/cheatsheet';

// https://microsoft.github.io/monaco-editor/playground.html#extending-language-services-custom-languages
export async function registerOpenSCADLanguage(fs: any, workingDir: string, zipArchives: ZipArchives) {
  const monaco = await loader.init();
  
  monaco.languages.register({
    id: 'openscad',
    extensions: ['.scad'],
    mimetypes: ["text/openscad"],
  });

  const { conf, language } = openscadLanguage;
  monaco.languages.setLanguageConfiguration('openscad', conf);
  monaco.languages.setMonarchTokensProvider('openscad', language);

  monaco.languages.registerCompletionItemProvider('openscad',
      await buildOpenSCADCompletionItemProvider(fs, workingDir, zipArchives));

  // Hovering a builtin shows its cheatsheet entries and a link to the manual.
  monaco.languages.registerHoverProvider('openscad', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      const entries = word && cheatsheetByName.get(word.word);
      if (!word || !entries) return null;
      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents: [
          {value: '```openscad\n' + entries.map(e => e.sig).join('\n') + '\n```'},
          {value: [...new Set(entries.map(e => e.doc))].join(' ') + `\n\n[OpenSCAD manual](${manualUrl(entries[0].link)})`},
        ],
      };
    },
  });
}

// OpenSCAD cheatsheet next to the editor: search it, click a signature to
// insert it at the cursor (with tab stops), follow the link to the manual.

import React, { CSSProperties, useContext, useState } from 'react';
import { flushSync } from 'react-dom';
import { InputText } from 'primereact/inputtext';
import { ModelContext } from './contexts.ts';
import { cheatsheet, HelpEntry, manualUrl } from '../help/cheatsheet.ts';
import { insertSnippet, snippetText } from '../language/active-editor.ts';

export default function HelpPanel({className, style}: {className?: string, style?: CSSProperties}) {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');

  const [query, setQuery] = useState('');
  const words = query.toLowerCase().split(/\s+/).filter(w => w);
  const sections = cheatsheet
    .map(section => ({
      ...section,
      entries: section.entries.filter(e => {
        const text = `${section.title} ${e.name ?? ''} ${e.sig} ${e.doc}`.toLowerCase();
        return words.every(w => text.includes(w));
      }),
    }))
    .filter(section => section.entries.length > 0);

  const insert = (entry: HelpEntry) => {
    if (!entry.insert) return;
    // On a narrow screen the help replaces the editor: bring the editor back
    // first, so it can take the focus and the snippet's tab stops.
    if (model.state.view.layout.mode === 'single') model.changeSingleVisibility('editor');
    setTimeout(() => {
      if (insertSnippet(entry.insert!)) return;
      // No Monaco (iOS / Android get a plain textarea): splice the text in at its cursor.
      const textarea = document.querySelector<HTMLTextAreaElement>('textarea.openscad-editor');
      const source = model.source;
      const start = textarea?.selectionStart ?? source.length;
      const end = textarea?.selectionEnd ?? start;
      const text = snippetText(entry.insert!);
      // Commit synchronously: React writing the new value moves the caret to the end.
      flushSync(() => { model.source = source.slice(0, start) + text + source.slice(end); });
      textarea?.focus();
      textarea?.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  return (
    <div className={`help-panel ${className ?? ''}`} style={{
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      // Opaque, unlike the customizer: in the single layout it sits on top of the viewer.
      background: 'var(--surface-card, white)',
      ...style,
    }}>
      <div style={{padding: '5px 10px'}}>
        <InputText
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search OpenSCAD (e.g. cylinder, extrude, $fn)"
          style={{width: '100%'}} />
      </div>
      {/* Absolutely placed, so the long list scrolls instead of making the page taller. */}
      <div style={{flex: 1, position: 'relative'}}>
      <div style={{position: 'absolute', inset: 0, overflowY: 'auto', padding: '0 10px 10px'}}>
        {sections.map(section => (
          <div key={section.title} style={{margin: '10px 0'}}>
            <div style={{fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', opacity: 0.6, margin: '4px 0'}}>
              {section.title}
            </div>
            {section.entries.map((entry, i) => (
              <div key={i} style={{padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.06)'}}>
                <div style={{display: 'flex', alignItems: 'baseline', gap: '6px'}}>
                  <code
                    onClick={() => insert(entry)}
                    title={entry.insert ? 'Insert at the cursor' : undefined}
                    style={{
                      flex: 1,
                      cursor: entry.insert ? 'pointer' : 'default',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color: entry.insert ? 'var(--primary-color)' : undefined,
                    }}>
                    {entry.sig}
                  </code>
                  <a href={manualUrl(entry.link)} target="_blank" rel="noopener noreferrer" title="Open in the OpenSCAD manual"
                     style={{opacity: 0.5}}>
                    <i className="pi pi-external-link" style={{fontSize: '0.75rem'}} />
                  </a>
                </div>
                <div style={{fontSize: '0.85rem', opacity: 0.8}}>{entry.doc}</div>
              </div>
            ))}
          </div>
        ))}
        {sections.length === 0 && <div style={{opacity: 0.6, margin: '10px 0'}}>Nothing matches “{query}”.</div>}
        <div style={{fontSize: '0.85rem', margin: '14px 0 4px', display: 'flex', flexWrap: 'wrap', gap: '12px'}}>
          <a href="https://en.wikibooks.org/wiki/OpenSCAD_User_Manual" target="_blank" rel="noopener noreferrer">OpenSCAD manual</a>
          <a href="https://openscad.org/cheatsheet/" target="_blank" rel="noopener noreferrer">Official cheatsheet</a>
          <a href="https://github.com/BelfrySCAD/BOSL2/wiki/CheatSheet" target="_blank" rel="noopener noreferrer">BOSL2 cheatsheet</a>
        </div>
      </div>
      </div>
    </div>
  );
}

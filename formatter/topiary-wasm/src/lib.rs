//! Topiary's OpenSCAD formatter for the browser.
//!
//! The grammar is compiled in (build.rs), so JS only passes the formatting
//! query: `init(query)` once, then `format(source)` per call. Synchronous and
//! self-contained, so it runs in a Web Worker as well as on the main thread.

use std::cell::RefCell;

use topiary_core::{formatter_str, Language, Operation, TopiaryQuery};
use tree_sitter_language::LanguageFn;
use wasm_bindgen::prelude::*;

extern "C" {
    fn tree_sitter_openscad() -> *const ();
}

const OPENSCAD: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_openscad) };

thread_local! {
    static LANGUAGE: RefCell<Option<Language>> = const { RefCell::new(None) };
}

#[wasm_bindgen]
pub fn init(query: &str) -> Result<(), JsError> {
    console_error_panic_hook::set_once();
    let grammar: topiary_tree_sitter_facade::Language = tree_sitter::Language::new(OPENSCAD).into();
    let formatting_query = TopiaryQuery::new(&grammar, query).map_err(report)?;
    LANGUAGE.with(|cell| {
        *cell.borrow_mut() = Some(Language {
            name: "openscad".into(),
            formatting_query,
            injection_query: None,
            grammar,
            indent: None,
        })
    });
    Ok(())
}

/// Formats `input`; fails on a parse error (like the CLI without -t) and when
/// a second pass would change the output again (the CLI's idempotence check).
#[wasm_bindgen]
pub fn format(input: &str) -> Result<String, JsError> {
    LANGUAGE.with(|cell| {
        let cell = cell.borrow();
        let language = cell
            .as_ref()
            .ok_or_else(|| JsError::new("formatter not initialised: call init() first"))?;
        let mut output = Vec::new();
        formatter_str(
            input,
            &mut output,
            language,
            Operation::Format {
                skip_idempotence: false,
                tolerate_parsing_errors: false,
                skip_stage: None,
            },
            None,
        )
        .map_err(report)?;
        String::from_utf8(output).map_err(|e| JsError::new(&e.to_string()))
    })
}

// topiary 0.8 errors are rootcause reports; their Display carries the cause chain.
fn report(e: impl std::fmt::Display) -> JsError {
    JsError::new(&e.to_string())
}

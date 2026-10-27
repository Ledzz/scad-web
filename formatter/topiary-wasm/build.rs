// Compiles the OpenSCAD tree-sitter grammar (parser.c, no external scanner)
// into this crate. On wasm32-unknown-unknown there is no libc, so the parser
// gets tree-sitter-language's stdlib headers, the same ones the tree-sitter
// runtime itself is built against.
fn main() {
    let src = std::path::Path::new("../tree-sitter-openscad/src");
    let mut cc = cc::Build::new();
    cc.std("c11").include(src).file(src.join("parser.c")).warnings(false);
    if let Ok(headers) = std::env::var("DEP_TREE_SITTER_LANGUAGE_WASM_HEADERS") {
        cc.include(headers);
    }
    cc.compile("tree-sitter-openscad");
    println!("cargo:rerun-if-changed={}", src.join("parser.c").display());
}

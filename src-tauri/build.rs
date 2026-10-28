fn main() {
    // Refresh native resources when branding assets change.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}

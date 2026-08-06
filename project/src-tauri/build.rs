fn main() {
  // Force Cargo to re-run this build script when capabilities change.
  println!("cargo:rerun-if-changed=capabilities/default.json");
  tauri_build::build()
}

use std::{fs, path::Path};

fn main() {
    // Ensure cargo rebuilds when WIT changes (simple recursive walk)
    fn watch_dir(dir: &Path) {
        if let Ok(rd) = fs::read_dir(dir) {
            for ent in rd.flatten() {
                let p = ent.path();
                if p.is_dir() {
                    watch_dir(&p);
                } else {
                    println!("cargo:rerun-if-changed={}", p.display());
                }
            }
        }
    }
    watch_dir(Path::new("wit"));

    let out_path = wit_bindgen_rust::Opts::default()
        .build()
        .generate_to_out_dir(Some("python-analysis"))
        .unwrap();

    // Expose location to your crate
    println!("cargo:rustc-env=WIT_BINDINGS={}", out_path.display());
}

use std::{env, fs, path::Path};

use wit_parser::{Type, TypeDefKind, UnresolvedPackage, UnresolvedPackageGroup};

fn main() {
    let target = env::var("TARGET").unwrap_or_default();
    let out_dir = env::var("OUT_DIR").unwrap();

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

    if target.starts_with("wasm32") {
        let out_path = wit_bindgen_rust::Opts::default()
            .build()
            .generate_to_out_dir(Some("host-bridge"))
            .unwrap();
        println!("cargo:rustc-env=WIT_BINDINGS={}", out_path.display());
    }

    // Always generate native stubs from the WIT file so they stay in sync.
    generate_native_stubs(&out_dir);
}

/// Parse the WIT file with `wit-parser` and generate stub functions that
/// `unimplemented!()`.  This keeps native stubs in sync with the WIT
/// interface automatically.
fn generate_native_stubs(out_dir: &str) {
    let wit_path = Path::new("wit/world.wit");
    let wit_src = fs::read_to_string(wit_path).expect("failed to read wit/world.wit");

    let pkg_group = UnresolvedPackageGroup::parse(wit_path, &wit_src)
        .expect("failed to parse WIT file");
    let pkg = &pkg_group.main;

    // Find the `host-utils` interface.
    let iface = pkg
        .interfaces
        .iter()
        .find(|(_, iface)| iface.name.as_deref() == Some("host-utils"))
        .map(|(_, iface)| iface)
        .expect("WIT file does not contain an `interface host-utils` block");

    let mut stubs = String::new();
    stubs.push_str("// Auto-generated from wit/world.wit -- do not edit.\n\n");

    for (_, func) in &iface.functions {
        let rust_name = func.name.replace('-', "_");

        let rust_args: Vec<String> = func
            .params
            .iter()
            .map(|(name, ty)| {
                let arg_name = name.replace('-', "_");
                let rust_ty = wit_type_to_rust_param(ty, pkg);
                format!("_{arg_name}: {rust_ty}")
            })
            .collect();

        let rust_ret = match &func.result {
            Some(ty) => format!(" -> {}", wit_type_to_rust_owned(ty, pkg)),
            None => String::new(),
        };

        stubs.push_str(&format!(
            "pub fn {rust_name}({args}){rust_ret} {{\n    \
             unimplemented!(\"host-bridge is only available on wasm32 targets\")\n\
             }}\n\n",
            args = rust_args.join(", "),
        ));
    }

    let stubs_path = Path::new(out_dir).join("native_stubs.rs");
    fs::write(&stubs_path, stubs).unwrap();
    println!(
        "cargo:rustc-env=NATIVE_STUBS_PATH={}",
        stubs_path.display()
    );
}

/// Convert a WIT `Type` to a Rust type suitable for function *parameters*
/// (i.e. `string` -> `&str`).
fn wit_type_to_rust_param(ty: &Type, pkg: &UnresolvedPackage) -> String {
    match ty {
        Type::String => "&str".into(),
        _ => wit_type_to_rust_owned(ty, pkg),
    }
}

/// Convert a WIT `Type` to a Rust type suitable for *owned* positions
/// (return types, tuple elements, result type parameters).
fn wit_type_to_rust_owned(ty: &Type, pkg: &UnresolvedPackage) -> String {
    match ty {
        Type::Bool => "bool".into(),
        Type::U8 => "u8".into(),
        Type::U16 => "u16".into(),
        Type::U32 => "u32".into(),
        Type::U64 => "u64".into(),
        Type::S8 => "i8".into(),
        Type::S16 => "i16".into(),
        Type::S32 => "i32".into(),
        Type::S64 => "i64".into(),
        Type::F32 => "f32".into(),
        Type::F64 => "f64".into(),
        Type::String => "String".into(),
        Type::Id(id) => {
            let td = &pkg.types[*id];
            match &td.kind {
                TypeDefKind::Tuple(tuple) => {
                    let inner: Vec<String> = tuple
                        .types
                        .iter()
                        .map(|t| wit_type_to_rust_owned(t, pkg))
                        .collect();
                    format!("({})", inner.join(", "))
                }
                TypeDefKind::Result(result) => {
                    let ok = match &result.ok {
                        Some(t) => wit_type_to_rust_owned(t, pkg),
                        None => "()".into(),
                    };
                    let err = match &result.err {
                        Some(t) => wit_type_to_rust_owned(t, pkg),
                        None => "()".into(),
                    };
                    format!("Result<{ok}, {err}>")
                }
                TypeDefKind::Option(t) => {
                    format!("Option<{}>", wit_type_to_rust_owned(t, pkg))
                }
                TypeDefKind::List(t) => {
                    format!("Vec<{}>", wit_type_to_rust_owned(t, pkg))
                }
                other => panic!(
                    "build.rs: unsupported WIT type in host-utils interface: {other:?}"
                ),
            }
        }
        other => panic!("build.rs: unsupported WIT primitive type: {other:?}"),
    }
}

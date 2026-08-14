/// Test harness macro for WASM component tests.
///
/// In `#[cfg(test)]` (native) mode the `#[test]` attributes work normally.
/// In WASM mode (`cargo test --target wasm32-wasip2`) we compile a `main()`
/// that runs each test function sequentially -- the standard test harness is
/// not available for component-model targets.
#[macro_export]
macro_rules! wasm_tests {
    ($($(#[$m:meta])* fn $name:ident() $body:block)*) => {
        $(fn $name() $body)*

        fn main() {
            let tests: &[(&str, fn())] = &[
                $((stringify!($name), $name as fn()),)*
            ];
            let total = tests.len();
            for (i, (name, f)) in tests.iter().enumerate() {
                eprint!("[{}/{}] {name} ... ", i + 1, total);
                f();
                eprintln!("ok");
            }
            eprintln!("\n{total} tests passed");
        }
    };
}

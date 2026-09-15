import compileall
import json
import signal
import sys
import time
from multiprocessing import Pool
from py_compile import PycInvalidationMode


def compile_source(source_file):
    try:
        start = time.perf_counter()
        ok = compileall.compile_file(
            source_file,
            force=True,
            quiet=1,
            invalidation_mode=PycInvalidationMode.UNCHECKED_HASH,
        )
        return (source_file, ok, time.perf_counter() - start)
    except Exception as error:
        print(f"Failed to compile {source_file}: {error}", file=sys.stderr)
        return (source_file, False, 0.0)


def main():
    with open(sys.argv[1], encoding="utf-8") as source_list:
        source_files = json.load(source_list)

    if not source_files:
        return 0

    # Optional argv[2]: write per-file compile timings (seconds) as JSON,
    # used by bytecode packing to rank files by compile cost per byte.
    timings_path = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        with Pool() as pool:
            def abort_pool(signum, _):
                pool.terminate()
                raise SystemExit(128 + signum)

            for sig in signal.SIGINT, signal.SIGTERM:
              signal.signal(sig, abort_pool)

            results = pool.map(compile_source, source_files)
    except Exception as error:
        print(f"Bytecode compilation unavailable: {error}", file=sys.stderr)
        return 1

    if timings_path:
        try:
            timings = {
                path: elapsed for path, ok, elapsed in results if ok and elapsed > 0
            }
            with open(timings_path, "w", encoding="utf-8") as out:
                json.dump(timings, out)
        except Exception as error:
            # Timings are advisory; never fail the compile over them.
            print(f"Could not write compile timings: {error}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())

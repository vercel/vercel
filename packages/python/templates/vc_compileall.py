import compileall
import importlib.util
import json
import os
import signal
import sys
from multiprocessing import Pool
from py_compile import PycInvalidationMode


def compile_source(source_file):
    bytecode_file = importlib.util.cache_from_source(source_file)
    try:
        os.unlink(bytecode_file)
    except FileNotFoundError:
        pass

    try:
        return compileall.compile_file(
            source_file,
            force=True,
            quiet=1,
            invalidation_mode=PycInvalidationMode.UNCHECKED_HASH,
        )
    except Exception as error:
        print(f"Failed to compile {source_file}: {error}", file=sys.stderr)
        return False


def main():
    with open(sys.argv[1], encoding="utf-8") as source_list:
        source_files = json.load(source_list)

    if not source_files:
        return 0

    try:
        with Pool() as pool:
            def abort_pool(signum, _):
                pool.terminate()
                raise SystemExit(128 + signum)

            for sig in signal.SIGINT, signal.SIGTERM:
              signal.signal(sig, abort_pool)

            pool.map(compile_source, source_files)
    except Exception as error:
        print(f"Bytecode compilation unavailable: {error}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())

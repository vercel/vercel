# Missing `--dotenv` Target

#### Why This Error Occurred

You specified a path as the value for the `--dotenv` flag, but the target of the path doesn't exist.

#### Possible Ways to Fix It

Make sure the target file you've specified exists and is readable by Vercel CLI. In addition, please ensure that the filename starts with a dot (example: `.env`) - then it should work.

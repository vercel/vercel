#!/usr/bin/env node
console.log(`Received ${process.argv.length} arguments`);
for (let i = 0; i < process.argv.length; i++) {
    console.log(`Arg ${i} = ${process.argv[i]}`);
}
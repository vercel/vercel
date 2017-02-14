#!/usr/bin/env bash
rm -rf build
async-to-gen --out-dir build/bin bin 
async-to-gen --out-dir build/lib lib
async-to-gen --out-dir build/lib/utils lib/utils
async-to-gen --out-dir build/lib/utils/input lib/utils/input
async-to-gen --out-dir build/lib/utils/output lib/utils/output
async-to-gen --out-dir build/lib/utils/billing lib/utils/billing
cp lib/utils/billing/*.json build/lib/utils/billing/
cp package.json build/

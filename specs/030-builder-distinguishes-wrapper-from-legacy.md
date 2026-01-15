# Builder distinguishes wrapper mode from legacy handler mode

## Category

functional

## Description

Builder distinguishes wrapper mode from legacy handler mode

## Steps

1. Provide package main with wrapper import -> wrapper mode
2. Provide package main without wrapper import -> error with guidance
3. Provide package handler with Handler func -> legacy mode
4. Each mode builds correctly

## Status

- [ ] Passes

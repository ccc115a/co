#!/bin/bash
set -x

iverilog -Wall -o sim singlecycle_test.v singlecycle.v alu.v control.v immgen.v regfile.v
vvp sim > sim.log
cat sim.log
rm -f sim
grep -q "^PASS" sim.log
rm -f sim.log

#!/bin/bash
set -x

iverilog -Wall -o sim pipeline_test.v pipeline.v alu.v control.v immgen.v regfile.v forwarding.v hazard.v
vvp sim > sim.log
cat sim.log
rm -f sim
grep -q "^PASS" sim.log
rm -f sim.log

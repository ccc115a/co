#!/bin/bash
set -x

iverilog -Wall -o sim riscvgpu_test.v riscvgpu.v lane.v alu.v control.v immgen.v regfile.v
vvp sim > sim.log
cat sim.log
rm -f sim
grep -q "^PASS" sim.log
rm -f sim.log

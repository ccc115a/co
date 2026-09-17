all: sim

sim: singlecycle_tb.vvp
	vvp singlecycle_tb.vvp

singlecycle_tb.vvp: alu.v regfile.v singlecycle.v forwarding.v singlecycle_tb.v
	iverilog -Wall -o singlecycle_tb.vvp alu.v regfile.v singlecycle.v forwarding.v singlecycle_tb.v

clean:
	rm -f singlecycle_tb.vvp

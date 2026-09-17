all: sim run-py

sim: tiny_core_tb.vvp
	vvp tiny_core_tb.vvp

tiny_core_tb.vvp: tiny_core.v tiny_core_tb.v
	iverilog -Wall -o tiny_core_tb.vvp tiny_core.v tiny_core_tb.v

run-py:
	python3 cores_compare.py

clean:
	rm -f tiny_core_tb.vvp

# ch10 Makefile：語法檢查與 dry-run（對應 10.2、10.3）
.PHONY: test all
test:
	cc -fsyntax-only host_opencl.c
	bash -n spirv_flow.sh
	bash spirv_flow.sh
all: test

// host 模擬 amoswap 自旋鎖並驗證互斥（對應 4.1-4.6）
// 編譯執行：gcc spinlock_host.c -pthread -o spinlock_host && ./spinlock_host
#include <assert.h>
#include <pthread.h>
#include <stdio.h>

#define NTHREAD 4
#define ITERS 20000

static volatile int lock = 0;  // 0 開、1 關（模擬 amoswap 字組）
static long counter = 0;

static void acquire(volatile int *l) {
    while (__sync_lock_test_and_set(l, 1)) {  // 原子置 1，舊值 1 表自旋
    }
}

static void release(volatile int *l) {
    __sync_lock_release(l);  // 原子寫回 0
}

static void *worker(void *arg) {
    (void)arg;
    for (int i = 0; i < ITERS; i++) {
        acquire(&lock);
        counter++;  // 臨界區
        release(&lock);
    }
    return NULL;
}

int main(void) {
    pthread_t th[NTHREAD];
    for (int i = 0; i < NTHREAD; i++)
        assert(pthread_create(&th[i], NULL, worker, NULL) == 0);
    for (int i = 0; i < NTHREAD; i++)
        assert(pthread_join(th[i], NULL) == 0);
    printf("counter = %ld (expect %d)\n", counter, NTHREAD * ITERS);
    assert(counter == (long)NTHREAD * ITERS && "互斥失敗：計數不符");
    printf("SELF-CHECK PASS\n");
    return 0;
}

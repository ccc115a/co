// spinlock_host.c — 以 C11 atomic 模擬 amoswap 自旋鎖（對應 16.6）
// 主機 gcc + pthread 可編譯執行；多執行緒累加驗證互斥，assert 通過。
#include <assert.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>

typedef struct { atomic_int locked; } spinlock_t;  // 0=空閒，1=上鎖

static inline void acquire(spinlock_t *lk) {
    // 模擬 amoswap.w.aq：原子寫 1 並取回舊值，舊值 0 才算搶到
    while (atomic_exchange_explicit(&lk->locked, 1, memory_order_acquire) != 0) {
        ;  // 自旋等待
    }
}

static inline void release(spinlock_t *lk) {
    atomic_store_explicit(&lk->locked, 0, memory_order_release);
}

#define NTHREAD 8
#define NITER 50000

static spinlock_t lock = { 0 };
static long counter = 0;  // 被鎖保護的共享計數器

static void *worker(void *arg) {
    (void)arg;
    for (int i = 0; i < NITER; i++) {
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
    printf("counter = %ld (expect %d)\n", counter, NTHREAD * NITER);
    assert(counter == (long)NTHREAD * NITER);  // 互斥正確才會相等
    printf("PASS: spinlock mutual exclusion\n");
    return 0;
}

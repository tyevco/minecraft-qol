/*
 * A stand-in for IPv6 on a machine that has none.
 *
 * Bedrock Dedicated Server opens one UDP socket per address family and exits
 * if either fails ("Port may be in use by another process" - it is not; the
 * IPv6 socket() returned EAFNOSUPPORT). Some containers, this repo's cloud
 * sandbox among them, have IPv6 compiled out of the kernel, so the server can
 * never start there, and the headless harness is the only way to measure a
 * pack without a person at the keyboard.
 *
 * Preloaded, this hands the server an IPv4 socket bound to loopback whenever
 * it asks for an IPv6 one, and swallows the IPv6-only socket options. Nothing
 * ever arrives on that socket, which is exactly what an unreachable IPv6 port
 * would do. run.mjs builds and preloads it on its own when /proc/net/if_inet6
 * is missing; it is never used where IPv6 exists.
 *
 *   cc -shared -fPIC -O2 -o dist/bds/no-ipv6.so tools/bds/no-ipv6.c -ldl
 */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <netinet/in.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

static int (*real_socket)(int, int, int);
static int (*real_bind)(int, const struct sockaddr *, socklen_t);
static int (*real_setsockopt)(int, int, int, const void *, socklen_t);
static int (*real_getsockname)(int, struct sockaddr *, socklen_t *);
static int (*real_close)(int);

/* Which descriptors are pretending to be IPv6. */
static unsigned char fake6[65536 / 8];
static int is_fake(int fd) { return fd >= 0 && fd < 65536 && (fake6[fd >> 3] >> (fd & 7)) & 1; }
static void set_fake(int fd, int on) {
  if (fd < 0 || fd >= 65536) return;
  if (on) fake6[fd >> 3] |= (unsigned char)(1 << (fd & 7));
  else fake6[fd >> 3] &= (unsigned char)~(1 << (fd & 7));
}

static void init(void) {
  if (real_socket) return;
  real_socket = dlsym(RTLD_NEXT, "socket");
  real_bind = dlsym(RTLD_NEXT, "bind");
  real_setsockopt = dlsym(RTLD_NEXT, "setsockopt");
  real_getsockname = dlsym(RTLD_NEXT, "getsockname");
  real_close = dlsym(RTLD_NEXT, "close");
}

int socket(int domain, int type, int protocol) {
  init();
  if (domain != AF_INET6) return real_socket(domain, type, protocol);
  int fd = real_socket(AF_INET, type, protocol == IPPROTO_IPV6 ? 0 : protocol);
  if (fd >= 0) set_fake(fd, 1);
  return fd;
}

int bind(int fd, const struct sockaddr *addr, socklen_t len) {
  init();
  if (is_fake(fd) && addr && addr->sa_family == AF_INET6 && len >= sizeof(struct sockaddr_in6)) {
    const struct sockaddr_in6 *in6 = (const struct sockaddr_in6 *)addr;
    struct sockaddr_in in4;
    memset(&in4, 0, sizeof in4);
    in4.sin_family = AF_INET;
    in4.sin_port = in6->sin6_port;
    in4.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    return real_bind(fd, (const struct sockaddr *)&in4, sizeof in4);
  }
  return real_bind(fd, addr, len);
}

int setsockopt(int fd, int level, int opt, const void *val, socklen_t len) {
  init();
  if (is_fake(fd) && level == IPPROTO_IPV6) return 0;
  return real_setsockopt(fd, level, opt, val, len);
}

/* Report the pretend socket as IPv6 (v4-mapped), so a caller reading the bound address back is not surprised. */
int getsockname(int fd, struct sockaddr *addr, socklen_t *len) {
  init();
  if (!is_fake(fd) || !addr || !len) return real_getsockname(fd, addr, len);
  struct sockaddr_in in4;
  socklen_t l4 = sizeof in4;
  int r = real_getsockname(fd, (struct sockaddr *)&in4, &l4);
  if (r != 0) return r;
  struct sockaddr_in6 in6;
  memset(&in6, 0, sizeof in6);
  in6.sin6_family = AF_INET6;
  in6.sin6_port = in4.sin_port;
  in6.sin6_addr.s6_addr[10] = 0xff;
  in6.sin6_addr.s6_addr[11] = 0xff;
  memcpy(&in6.sin6_addr.s6_addr[12], &in4.sin_addr, 4);
  socklen_t n = *len < sizeof in6 ? *len : sizeof in6;
  memcpy(addr, &in6, n);
  *len = sizeof in6;
  return 0;
}

int close(int fd) {
  init();
  set_fake(fd, 0);
  return real_close(fd);
}

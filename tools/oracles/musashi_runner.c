#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "m68k.h"

#define MEMORY_SIZE 0x01000000u
#define MAX_WRITES 256

typedef struct {
  unsigned int address;
  unsigned int size;
  unsigned int value;
} memory_write_t;

static unsigned char memory[MEMORY_SIZE];
static memory_write_t writes[MAX_WRITES];
static unsigned int write_count = 0;

static unsigned int normalize(unsigned int address) {
  return address & 0x00ffffffu;
}

unsigned int m68k_read_memory_8(unsigned int address) {
  return memory[normalize(address)];
}

unsigned int m68k_read_memory_16(unsigned int address) {
  unsigned int normalized = normalize(address);
  return (memory[normalized] << 8) | memory[normalize(normalized + 1)];
}

unsigned int m68k_read_memory_32(unsigned int address) {
  return (m68k_read_memory_16(address) << 16) | m68k_read_memory_16(address + 2);
}

static void record_write(unsigned int address, unsigned int size, unsigned int value) {
  if (write_count < MAX_WRITES) {
    writes[write_count].address = normalize(address);
    writes[write_count].size = size;
    writes[write_count].value = value;
    write_count += 1;
  }
}

void m68k_write_memory_8(unsigned int address, unsigned int value) {
  unsigned int normalized = normalize(address);
  memory[normalized] = value & 0xffu;
  record_write(normalized, 1, value & 0xffu);
}

void m68k_write_memory_16(unsigned int address, unsigned int value) {
  unsigned int normalized = normalize(address);
  memory[normalized] = (value >> 8) & 0xffu;
  memory[normalize(normalized + 1)] = value & 0xffu;
  record_write(normalized, 2, value & 0xffffu);
}

void m68k_write_memory_32(unsigned int address, unsigned int value) {
  unsigned int normalized = normalize(address);
  memory[normalized] = (value >> 24) & 0xffu;
  memory[normalize(normalized + 1)] = (value >> 16) & 0xffu;
  memory[normalize(normalized + 2)] = (value >> 8) & 0xffu;
  memory[normalize(normalized + 3)] = value & 0xffu;
  record_write(normalized, 4, value);
}

void m68k_write_memory_32_pd(unsigned int address, unsigned int value) {
  m68k_write_memory_16(address + 2, (value >> 16) & 0xffffu);
  m68k_write_memory_16(address, value & 0xffffu);
}

unsigned int m68k_read_disassembler_8(unsigned int address) {
  return m68k_read_memory_8(address);
}

unsigned int m68k_read_disassembler_16(unsigned int address) {
  return m68k_read_memory_16(address);
}

unsigned int m68k_read_disassembler_32(unsigned int address) {
  return m68k_read_memory_32(address);
}

static unsigned int parse_u32(const char *value) {
  char *end = NULL;
  unsigned long parsed = strtoul(value, &end, 0);
  if (end == value || *end != '\0' || parsed > 0xfffffffful) {
    fprintf(stderr, "Invalid unsigned 32-bit value: %s\n", value);
    exit(2);
  }
  return (unsigned int)parsed;
}

static unsigned int parse_env_u32(const char *name) {
  const char *value = getenv(name);
  return value == NULL ? 0u : parse_u32(value);
}

static void load_hex(unsigned int address, const char *hex) {
  size_t length = strlen(hex);
  size_t index;
  if ((length & 1u) != 0) {
    fprintf(stderr, "Instruction hex must contain complete bytes\n");
    exit(2);
  }

  for (index = 0; index < length; index += 2) {
    char byte_text[3] = {hex[index], hex[index + 1], '\0'};
    memory[normalize(address + (unsigned int)(index / 2))] =
      (unsigned char)strtoul(byte_text, NULL, 16);
  }
}

int main(int argc, char **argv) {
  unsigned int pc;
  unsigned int sr;
  unsigned int index;
  int cycles;

  if (argc != 20) {
    fprintf(stderr, "usage: musashi-runner HEX PC SR D0..D7 A0..A7\n");
    return 2;
  }

  memset(memory, 0, sizeof(memory));
  pc = parse_u32(argv[2]);
  sr = parse_u32(argv[3]);
  load_hex(pc, argv[1]);

  m68k_init();
  m68k_set_cpu_type(
    getenv("M68K_CPU_MODEL") != NULL && strcmp(getenv("M68K_CPU_MODEL"), "m68010") == 0
      ? M68K_CPU_TYPE_68010
      : M68K_CPU_TYPE_68000);
  m68k_pulse_reset();
  m68k_execute(0);

  for (index = 0; index < 8; index += 1) {
    m68k_set_reg((m68k_register_t)(M68K_REG_D0 + index), parse_u32(argv[4 + index]));
  }
  for (index = 0; index < 8; index += 1) {
    m68k_set_reg((m68k_register_t)(M68K_REG_A0 + index), parse_u32(argv[12 + index]));
  }
  m68k_set_reg(M68K_REG_SR, sr);
  m68k_set_reg(M68K_REG_PC, pc);
  m68k_set_reg(M68K_REG_VBR, parse_env_u32("M68K_VBR"));
  m68k_set_reg(M68K_REG_SFC, parse_env_u32("M68K_SFC"));
  m68k_set_reg(M68K_REG_DFC, parse_env_u32("M68K_DFC"));
  write_count = 0;

  cycles = m68k_execute(1);

  printf("{\"d\":[");
  for (index = 0; index < 8; index += 1) {
    if (index != 0) printf(",");
    printf("%u", m68k_get_reg(NULL, (m68k_register_t)(M68K_REG_D0 + index)));
  }
  printf("],\"a\":[");
  for (index = 0; index < 8; index += 1) {
    if (index != 0) printf(",");
    printf("%u", m68k_get_reg(NULL, (m68k_register_t)(M68K_REG_A0 + index)));
  }
  printf("],\"pc\":%u,\"sr\":%u,\"vbr\":%u,\"sfc\":%u,\"dfc\":%u,\"cycles\":%d,\"writes\":[",
         m68k_get_reg(NULL, M68K_REG_PC),
         m68k_get_reg(NULL, M68K_REG_SR),
         m68k_get_reg(NULL, M68K_REG_VBR),
         m68k_get_reg(NULL, M68K_REG_SFC),
         m68k_get_reg(NULL, M68K_REG_DFC),
         cycles);
  for (index = 0; index < write_count; index += 1) {
    if (index != 0) printf(",");
    printf("[%u,%u,%u]", writes[index].address, writes[index].size, writes[index].value);
  }
  printf("]}\n");

  return 0;
}

#include <array>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

#include "Moira.h"

using namespace moira;

struct MemoryWrite {
    u32 address;
    u32 size;
    u32 value;
};

class RunnerCpu final : public Moira {
public:
    mutable std::array<u8, 0x01000000> memory {};
    mutable std::vector<MemoryWrite> writes;

    u8 read8(u32 address) const override {
        return memory[address & 0x00ffffff];
    }

    u16 read16(u32 address) const override {
        const u32 normalized = address & 0x00ffffff;
        return u16(memory[normalized] << 8) | memory[(normalized + 1) & 0x00ffffff];
    }

    u16 read16OnReset(u32 address) const override {
        return read16(address);
    }

    void write8(u32 address, u8 value) const override {
        const u32 normalized = address & 0x00ffffff;
        memory[normalized] = value;
        writes.push_back({normalized, 1, value});
    }

    void write16(u32 address, u16 value) const override {
        const u32 normalized = address & 0x00ffffff;
        memory[normalized] = u8(value >> 8);
        memory[(normalized + 1) & 0x00ffffff] = u8(value);
        writes.push_back({normalized, 2, value});
    }
};

static u32 parseU32(const char *value) {
    char *end = nullptr;
    const unsigned long parsed = std::strtoul(value, &end, 0);
    if (end == value || *end != '\0' || parsed > 0xfffffffful) {
        std::fprintf(stderr, "Invalid unsigned 32-bit value: %s\n", value);
        std::exit(2);
    }
    return u32(parsed);
}

static u32 parseEnvU32(const char *name) {
    const char *value = std::getenv(name);
    return value == nullptr ? 0 : parseU32(value);
}

static void write32(std::array<u8, 0x01000000> &memory, u32 address, u32 value) {
    const u32 normalized = address & 0x00ffffff;
    memory[normalized] = u8(value >> 24);
    memory[(normalized + 1) & 0x00ffffff] = u8(value >> 16);
    memory[(normalized + 2) & 0x00ffffff] = u8(value >> 8);
    memory[(normalized + 3) & 0x00ffffff] = u8(value);
}

static void loadHex(std::array<u8, 0x01000000> &memory, u32 address, const char *hex) {
    const size_t length = std::strlen(hex);
    if ((length & 1u) != 0) {
        std::fprintf(stderr, "Instruction hex must contain complete bytes\n");
        std::exit(2);
    }

    for (size_t index = 0; index < length; index += 2) {
        char byteText[3] = {hex[index], hex[index + 1], '\0'};
        memory[(address + u32(index / 2)) & 0x00ffffff] =
            u8(std::strtoul(byteText, nullptr, 16));
    }
}

int main(int argc, char **argv) {
    if (argc != 20) {
        std::fprintf(stderr, "usage: moira-runner HEX PC SR D0..D7 A0..A7\n");
        return 2;
    }

    static RunnerCpu cpu;
    const u32 pc = parseU32(argv[2]);
    const u16 sr = u16(parseU32(argv[3]));
    const u32 initialSp = parseU32(argv[19]);
    write32(cpu.memory, 0, initialSp);
    write32(cpu.memory, 4, pc);
    loadHex(cpu.memory, pc, argv[1]);

    const char *model = std::getenv("M68K_CPU_MODEL");
    cpu.setModel(model != nullptr && std::strcmp(model, "m68020") == 0
        ? Model::M68020
        : model != nullptr && std::strcmp(model, "m68010") == 0
          ? Model::M68010
          : Model::M68000);
    cpu.reset();
    for (int index = 0; index < 8; index += 1) {
        cpu.setD(index, parseU32(argv[4 + index]));
        cpu.setA(index, parseU32(argv[12 + index]));
    }
    cpu.setSR(sr);
    cpu.setPC(pc);
    cpu.setVBR(parseEnvU32("M68K_VBR"));
    cpu.setSFC(parseEnvU32("M68K_SFC"));
    cpu.setDFC(parseEnvU32("M68K_DFC"));
    cpu.setClock(0);
    cpu.writes.clear();
    cpu.execute();

    std::printf("{\"d\":[");
    for (int index = 0; index < 8; index += 1) {
        if (index != 0) std::printf(",");
        std::printf("%u", cpu.getD(index));
    }
    std::printf("],\"a\":[");
    for (int index = 0; index < 8; index += 1) {
        if (index != 0) std::printf(",");
        std::printf("%u", cpu.getA(index));
    }
    std::printf("],\"pc\":%u,\"sr\":%u,\"vbr\":%u,\"sfc\":%u,\"dfc\":%u,\"cycles\":%lld,\"writes\":[",
                cpu.getPC(),
                cpu.getSR(),
                cpu.getVBR(),
                cpu.getSFC(),
                cpu.getDFC(),
                static_cast<long long>(cpu.getClock()));
    for (size_t index = 0; index < cpu.writes.size(); index += 1) {
        if (index != 0) std::printf(",");
        const auto &write = cpu.writes[index];
        std::printf("[%u,%u,%u]", write.address, write.size, write.value);
    }
    std::printf("]}\n");
}

/* AEML, NTUST -- stand-in for the Rust Naga SPIR-V -> WGSL bridge.
 *
 * The Naga library is only used by the experimental WebGPU *hardware*
 * renderer (video=wgpu). The default software renderer never calls it.
 * Building the real crate needs a Rust nightly toolchain; this stub lets the
 * core build without Rust. With the stub, video=wgpu reports a clear error
 * instead of translating shaders.
 * SPDX-License-Identifier: GPL-2.0-or-later */
#include <stddef.h>
#include <stdint.h>

static const char* const k_stub_error =
    "Naga SPIR-V->WGSL bridge not included in this build (AEML core); "
    "use the software renderer";

const char* naga_last_error(void)
{
  return k_stub_error;
}

char* naga_spirv_to_wgsl(const uint32_t* spirv_ptr, size_t spirv_word_count)
{
  (void)spirv_ptr;
  (void)spirv_word_count;
  return NULL;
}

void naga_free_wgsl(char* ptr)
{
  (void)ptr;
}

#include <jni.h>
#include "NitroPlayOnLoad.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return margelo::nitro::video::initialize(vm);
}

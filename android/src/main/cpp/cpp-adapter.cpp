#include <jni.h>
#include "JustPlayerOnLoad.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return margelo::nitro::video::initialize(vm);
}

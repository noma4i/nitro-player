package com.nitroplay.video.bridge

import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.nitroplay.video.bridge.NitroPlayStreamRuntimeModule

class NitroPlayPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(NitroPlayStreamRuntimeModule(reactContext))
  }

  @OptIn(UnstableApi::class)
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return listOf(NitroPlayerViewManager())
  }

  companion object {
    init {
      System.loadLibrary("NitroPlay")
    }
  }
}

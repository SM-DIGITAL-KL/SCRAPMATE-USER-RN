package com.alpts.scrapmate

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.alpts.scrapmate.NavigationBarPackage
import com.alpts.scrapmate.UPIPaymentPackage
import com.alpts.scrapmate.NativeMapViewPackage
import com.alpts.scrapmate.KeyboardControllerPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(NavigationBarPackage())
          add(UPIPaymentPackage())
          add(NativeMapViewPackage())  // Small screen map
          add(KeyboardControllerPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}

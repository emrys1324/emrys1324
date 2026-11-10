package cafe.pahuway.isla;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tells the web app what this build supports. Push needs Firebase, which is only
 * present when the build included google-services.json (the google-services Gradle
 * plugin then generates the "google_app_id" string). Calling the push plugin without
 * it would crash the app, so the web code checks this first.
 */
@CapacitorPlugin(name = "IslaConfig")
public class IslaConfigPlugin extends Plugin {
    @PluginMethod
    public void get(PluginCall call) {
        int id = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
        JSObject result = new JSObject();
        result.put("pushEnabled", id != 0);
        result.put("versionName", BuildConfig.VERSION_NAME);
        result.put("versionCode", BuildConfig.VERSION_CODE);
        call.resolve(result);
    }
}

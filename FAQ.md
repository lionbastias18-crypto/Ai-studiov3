# ❓ Frequently Asked Questions

> **Common questions and answers about building Android APKs with GitHub Actions**

## 🚀 Getting Started

### Q: Do I really not need Android Studio?
**A:** Correct! You don't need Android Studio, Android SDK, or any Android development tools on your local machine. Everything builds in the cloud using GitHub Actions.

### Q: Is this completely free?
**A:** Yes, for public repositories, GitHub provides 2000 minutes per month of free GitHub Actions usage. For private repositories, you get 500 minutes per month on the free tier.

### Q: How long does it take to build an APK?
**A:** Typically 3-5 minutes for the first build (downloading dependencies), and 2-3 minutes for subsequent builds (with caching).

### Q: What Android versions does this support?
**A:** The generated APK supports Android 5.0 (API level 21) and above, which covers 99%+ of active Android devices.

## 🛠️ Technical Questions

### Q: Can I use this for production apps?
**A:** Yes, but you'll need to add app signing for production releases. The current setup generates unsigned APKs suitable for testing and development.

### Q: How do I add app signing?
**A:** You can add signing by:
1. Creating a keystore file
2. Adding the keystore to GitHub Secrets
3. Modifying the build.gradle to use the keystore
4. Updating the GitHub Actions workflow

### Q: Can I add my own dependencies/libraries?
**A:** Absolutely! Edit `app/build.gradle` and add dependencies in the `dependencies` block:
```gradle
dependencies {
    implementation 'androidx.recyclerview:recyclerview:1.3.2'
    implementation 'com.squareup.retrofit2:retrofit:2.9.0'
    // Add more here
}
```

### Q: How do I change the app icon?
**A:** Replace the icon files in `app/src/main/res/mipmap-*` directories with your own icons in the following sizes:
- mdpi: 48x48px
- hdpi: 72x72px  
- xhdpi: 96x96px
- xxhdpi: 144x144px
- xxxhdpi: 192x192px

### Q: Can I build multiple APKs with different configurations?
**A:** Yes! You can create build variants in `app/build.gradle`:
```gradle
android {
    productFlavors {
        free {
            applicationIdSuffix ".free"
        }
        paid {
            applicationIdSuffix ".paid"
        }
    }
}
```

## 🔧 Troubleshooting

### Q: My build is failing with "Gradle wrapper not found"
**A:** Ensure these files are in your repository:
- `gradlew` (Unix script)
- `gradlew.bat` (Windows script)
- `gradle/wrapper/gradle-wrapper.properties`

### Q: The APK won't install on my device
**A:** Try these solutions:
1. Enable "Unknown sources" in Android Settings > Security
2. Use the debug APK (`app-debug.apk`) for testing
3. Uninstall any existing app with the same package name
4. Check that your device runs Android 5.0 or higher

### Q: I can't find the APK download
**A:** After a successful build:
1. Go to your repository on GitHub
2. Click the "Actions" tab
3. Click on the latest successful workflow run (green checkmark)
4. Scroll down to the "Artifacts" section
5. Download the APK file

### Q: The build takes too long or times out
**A:** This can happen if:
- Dependencies are large or numerous
- The repository is very large
- GitHub Actions is experiencing high load

Try reducing dependencies or contact GitHub Support if the issue persists.

### Q: I get "No space left on device" error
**A:** This is rare but can happen with very large projects. Solutions:
- Reduce the number of dependencies
- Remove unnecessary files from the repository
- Use `.gitignore` to exclude large files

## 🎨 Customization

### Q: How do I change the app name?
**A:** Edit `app/src/main/res/values/strings.xml`:
```xml
<string name="app_name">Your App Name</string>
```

### Q: How do I change the package name?
**A:** 1. Edit `app/build.gradle`:
```gradle
android {
    namespace 'com.yourcompany.yourapp'
    defaultConfig {
        applicationId "com.yourcompany.yourapp"
    }
}
```
2. Rename the folder structure in `app/src/main/java/`
3. Update the package declaration in `MainActivity.kt`

### Q: Can I add multiple screens/activities?
**A:** Yes! Create new Kotlin files and XML layouts, then register them in `AndroidManifest.xml`:
```xml
<activity
    android:name=".SecondActivity"
    android:exported="false" />
```

### Q: How do I add images or other resources?
**A:** Place files in the appropriate resource directories:
- Images: `app/src/main/res/drawable/`
- Raw files: `app/src/main/res/raw/`
- Assets: `app/src/main/assets/`

## 🔄 Workflow Questions

### Q: Can I trigger builds manually?
**A:** Yes! The workflow includes `workflow_dispatch` which allows manual triggering from the Actions tab.

### Q: How often do artifacts expire?
**A:** GitHub automatically deletes artifacts after 90 days. You can download and save them locally if needed longer.

### Q: Can I build on different branches?
**A:** The current workflow builds on `main` and `master` branches. You can modify `.github/workflows/android-build.yml` to include other branches:
```yaml
on:
  push:
    branches: [ "main", "master", "develop" ]
```

### Q: Can I get notifications when builds complete?
**A:** GitHub sends email notifications by default. You can also:
- Watch the repository for all activity
- Use third-party tools like Slack or Discord integrations
- Set up custom webhook notifications

## 📱 Device and Testing

### Q: How do I test on different Android versions?
**A:** You can:
- Install on physical devices with different Android versions
- Use online Android emulators
- Install Android Studio for local emulator testing
- Use cloud testing services like Firebase Test Lab

### Q: Can I generate signed APKs for the Google Play Store?
**A:** Not by default, but you can add signing configuration:
1. Create a signing key
2. Add it to GitHub Secrets
3. Modify the build configuration
4. Update the workflow to sign APKs

### Q: How do I debug app crashes?
**A:** Several approaches:
1. Check the build logs in GitHub Actions
2. Use `adb logcat` when connected to a device
3. Add logging statements to your code
4. Use Android Studio's debugging tools
5. Test with the debug APK first

## 💰 Costs and Limits

### Q: What are the GitHub Actions limits?
**A:** For free accounts:
- **Public repos**: 2000 minutes/month
- **Private repos**: 500 minutes/month
- Each build uses ~3-5 minutes

### Q: What happens if I exceed the limits?
**A:** Builds will be queued until the next month, or you can upgrade to a paid plan.

### Q: Can I use this for commercial projects?
**A:** Yes, the code is MIT licensed. Just be aware of GitHub's terms of service and any usage limits.

### Q: Are there any storage costs?
**A:** Artifacts are stored free for 90 days. Very large repositories might incur storage costs, but typical Android projects are well within free limits.

## 🤝 Community and Support

### Q: How do I get help if I'm stuck?
**A:** Several options:
1. Check this FAQ and the main documentation
2. Search existing GitHub Issues
3. Create a new Issue with your specific problem
4. Start a Discussion for general questions
5. Join the community Discord/Slack (if available)

### Q: How can I contribute to this project?
**A:** We welcome contributions! See `CONTRIBUTING.md` for detailed guidelines. You can:
- Fix bugs
- Add new features
- Improve documentation
- Share examples
- Help other users

### Q: Can I fork this for my own template?
**A:** Absolutely! The project is MIT licensed. Fork it, customize it, and make it your own.

### Q: How do I stay updated with new features?
**A:** - Star the repository on GitHub
- Watch the repository for releases
- Follow the project maintainers
- Check the changelog regularly

## 🔮 Advanced Usage

### Q: Can I integrate with CI/CD pipelines?
**A:** Yes! You can:
- Trigger builds from other repositories
- Use the APK in automated testing
- Deploy to internal distribution systems
- Integrate with project management tools

### Q: Can I build for different architectures (ARM, x86)?
**A:** The default configuration builds universal APKs. You can create architecture-specific APKs by modifying `app/build.gradle`:
```gradle
android {
    splits {
        abi {
            enable true
            reset()
            include "arm64-v8a", "armeabi-v7a", "x86", "x86_64"
        }
    }
}
```

### Q: How do I optimize build performance?
**A:** Several strategies:
- Use Gradle build cache (already enabled)
- Minimize dependencies
- Use specific dependency versions
- Exclude unnecessary resources
- Enable parallel builds

---

**Don't see your question here?** Create an issue or start a discussion on GitHub! We're always happy to help and improve this documentation. 🚀
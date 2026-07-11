# 📱 Complete Setup Guide

> **Step-by-step instructions for creating your first Android APK with GitHub Actions**

This guide will walk you through every step of the process, from downloading the code to getting your first APK.

## 🎯 Overview

You'll learn how to:
1. Set up the required software on your computer
2. Get the Android project code
3. Upload it to GitHub
4. Download your compiled APK

**Time needed**: 15-30 minutes (depending on your experience level)

## 🛠️ Step 1: Install Required Software

### Windows Users

#### Install Git
1. **Download Git**:
   - Go to [git-scm.com](https://git-scm.com/download/win)
   - Click "Download for Windows"
   - Download will start automatically

2. **Install Git**:
   - Run the downloaded installer
   - Click "Next" through all the default options
   - Click "Install" and wait for completion
   - Click "Finish"

3. **Verify Installation**:
   - Press `Windows + R`, type `cmd`, press Enter
   - Type `git --version` and press Enter
   - You should see something like: `git version 2.x.x.windows.x`

#### Install VS Code (Optional but Recommended)
1. **Download VS Code**:
   - Go to [code.visualstudio.com](https://code.visualstudio.com/)
   - Click "Download for Windows"

2. **Install VS Code**:
   - Run the installer
   - Accept the agreement and click "Next"
   - Choose installation location (default is fine)
   - Select "Create a desktop icon" if desired
   - Click "Install"

### Mac Users

#### Install Git
```bash
# Check if Git is already installed
git --version

# If not installed, install using Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install git
```

#### Install VS Code
```bash
# Using Homebrew
brew install --cask visual-studio-code

# Or download from https://code.visualstudio.com/
```

### Linux Users

#### Ubuntu/Debian
```bash
# Update package list
sudo apt update

# Install Git
sudo apt install git

# Install VS Code
wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > packages.microsoft.gpg
sudo install -o root -g root -m 644 packages.microsoft.gpg /etc/apt/trusted.gpg.d/
sudo sh -c 'echo "deb [arch=amd64,arm64,armhf signed-by=/etc/apt/trusted.gpg.d/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" > /etc/apt/sources.list.d/vscode.list'
sudo apt update
sudo apt install code
```

#### Other Distributions
Use your distribution's package manager to install `git` and optionally VS Code.

## 🌐 Step 2: Set Up GitHub Account

### Create GitHub Account
1. **Go to GitHub**:
   - Visit [github.com](https://github.com)
   - Click "Sign up"

2. **Fill in Details**:
   - Choose a username (this will be public)
   - Enter your email address
   - Create a strong password
   - Complete the verification

3. **Verify Email**:
   - Check your email inbox
   - Click the verification link from GitHub

### Fork the Repository
1. **Go to the Project**:
   - Visit the Android APK Builder repository
   - Click the "Fork" button in the top right

2. **Create Your Fork**:
   - Choose your account as the destination
   - Keep the repository name or change it
   - Click "Create fork"

Now you have your own copy of the project!

## 💻 Step 3: Download the Code

### Method A: Using Git (Recommended)

1. **Open Terminal/Command Prompt**:
   - **Windows**: Press `Windows + R`, type `cmd`, press Enter
   - **Mac**: Press `Cmd + Space`, type "Terminal", press Enter
   - **Linux**: Use your terminal application

2. **Navigate to Your Projects Folder**:
   ```bash
   # Create a folder for your projects (if it doesn't exist)
   mkdir Projects
   cd Projects
   ```

3. **Clone Your Fork**:
   ```bash
   # Replace YOUR_USERNAME with your GitHub username
   git clone https://github.com/YOUR_USERNAME/android-apk-builder.git
   
   # Enter the project folder
   cd android-apk-builder
   ```

### Method B: Download ZIP

1. **Download ZIP**:
   - Go to your forked repository on GitHub
   - Click the green "Code" button
   - Click "Download ZIP"

2. **Extract Files**:
   - Extract the ZIP file to your projects folder
   - Rename the folder if desired

## 📝 Step 4: Customize Your App (Optional)

Before building, you might want to customize the app:

### Change App Name
1. **Open the project** in VS Code or your text editor
2. **Edit** `app/src/main/res/values/strings.xml`
3. **Change** the app name:
   ```xml
   <string name="app_name">My Awesome App</string>
   ```

### Change App Colors
1. **Edit** `app/src/main/res/values/colors.xml`
2. **Modify** colors as desired:
   ```xml
   <color name="button_color">#FF9C27B0</color>  <!-- Purple button -->
   <color name="primary_text">#FF3F51B5</color> <!-- Indigo text -->
   ```

### Customize Package Name
1. **Edit** `app/build.gradle`
2. **Find** and modify:
   ```gradle
   android {
       namespace 'com.yourname.yourapp'
       defaultConfig {
           applicationId "com.yourname.yourapp"
       }
   }
   ```

## 🚀 Step 5: Upload to GitHub

### Using Command Line (Git)

1. **Add Your Changes**:
   ```bash
   # Add all files
   git add .
   
   # Commit with a message
   git commit -m "Initial setup with my customizations"
   ```

2. **Push to GitHub**:
   ```bash
   # Push to your repository
   git push origin main
   ```

### Using VS Code

1. **Open VS Code** in your project folder
2. **Open Terminal** in VS Code (`Terminal > New Terminal`)
3. **Run the same commands** as above

### Using GitHub Desktop (Alternative)

1. **Download GitHub Desktop** from [desktop.github.com](https://desktop.github.com/)
2. **Install and sign in** with your GitHub account
3. **Clone your repository** using the app
4. **Make your changes** and commit through the interface

## ⏳ Step 6: Wait for the Build

### Automatic Building
1. **Go to Your Repository** on GitHub
2. **Click the "Actions" tab**
3. **Watch the Build Process**:
   - You'll see a workflow running (orange circle)
   - Wait for it to complete (green checkmark ✅)
   - This usually takes 3-5 minutes

### If the Build Fails
- **Click on the failed workflow** (red X)
- **Review the error logs**
- **Common fixes**:
  - Check that all files were uploaded correctly
  - Verify that `gradlew` files are present
  - Ensure the workflow file is in `.github/workflows/`

## 📱 Step 7: Download Your APK

### Download from GitHub
1. **Go to the Actions tab** in your repository
2. **Click on the latest successful run** (green checkmark)
3. **Scroll down to "Artifacts"**
4. **Download your APK**:
   - `app-debug.apk` - For testing (recommended)
   - `app-release-unsigned.apk` - For sharing (advanced)

### Install on Your Device

#### Android Device
1. **Transfer the APK** to your Android device
2. **Enable Unknown Sources**:
   - Go to Settings > Security
   - Enable "Unknown sources" or "Install unknown apps"
3. **Install the APK**:
   - Find the APK file using a file manager
   - Tap on it and follow the installation prompts

#### Android Emulator
1. **Download Android Studio** (if you want to use the emulator)
2. **Create a virtual device**
3. **Drag and drop the APK** onto the emulator

## 🔧 Step 8: Making Changes

### Edit Your App
1. **Make changes** to the code/resources
2. **Commit your changes**:
   ```bash
   git add .
   git commit -m "Describe what you changed"
   git push origin main
   ```
3. **GitHub Actions will automatically build** a new APK
4. **Download the updated APK** from the Actions tab

### Common Changes
- **Change button text**: Edit `strings.xml`
- **Modify colors**: Edit `colors.xml`
- **Update logic**: Edit `MainActivity.kt`
- **Change layout**: Edit `activity_main.xml`

## 🆘 Troubleshooting

### Common Issues

#### "Git is not recognized"
- **Problem**: Git not installed properly
- **Solution**: Reinstall Git and restart your terminal

#### "Permission denied" on gradlew
- **Problem**: File permissions on Linux/Mac
- **Solution**: Run `chmod +x gradlew`

#### Build fails with "Gradle wrapper not found"
- **Problem**: Missing gradlew files
- **Solution**: Ensure all files were uploaded to GitHub

#### APK won't install
- **Problem**: Package name conflicts or security settings
- **Solutions**:
  - Enable "Unknown sources" in Android settings
  - Uninstall any existing app with the same package name
  - Use the debug APK for testing

### Getting Help
- **Check the main README** for detailed troubleshooting
- **Create an issue** on GitHub if you're stuck
- **Ask in Discussions** for general questions

## 🎉 Congratulations!

You've successfully:
- ✅ Set up your development environment
- ✅ Customized an Android app
- ✅ Built an APK using GitHub Actions
- ✅ Downloaded and potentially installed your app

## 🚀 What's Next?

### Learn More
- **Android Development**: [developer.android.com](https://developer.android.com/)
- **Kotlin Programming**: [kotlinlang.org](https://kotlinlang.org/)
- **GitHub Actions**: [docs.github.com/actions](https://docs.github.com/actions)

### Expand Your App
- Add more activities and screens
- Integrate with APIs
- Add database storage
- Implement user authentication
- Publish to Google Play Store

### Share Your Success
- Share your APK with friends
- Contribute back to the project
- Help other developers get started
- Build something amazing!

---

**Need help?** Don't hesitate to ask in the GitHub Discussions or create an issue. The community is here to help! 🤝
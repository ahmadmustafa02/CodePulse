# GitHub Actions workflows

## Android debug APK (`android-build.yml`)

### Run the workflow manually

1. Open the repository on GitHub.
2. Go to the **Actions** tab.
3. Select **Build Android APK** in the left sidebar.
4. Click **Run workflow**, choose the branch (if prompted), then confirm **Run workflow**.

### Download the APK

1. Open **Actions** and click the workflow run you care about (green checkmark when it finished successfully).
2. Scroll to **Artifacts** at the bottom of the run summary.
3. Download **`codepulse-android-debug`** (ZIP containing `app-debug.apk`). Artifacts are kept for **14 days**.

### Install on your phone

1. On the device, allow installing apps from unknown sources (wording varies by Android version / OEM), or use “Install unknown apps” for the app you use to open the APK (e.g. Files or Chrome).
2. Copy the APK to the phone (USB, cloud drive, email to yourself, etc.).
3. Open the APK file on the phone and follow the prompts to install.

For day-to-day development you still need a machine with the repo to change code; this workflow only produces a **debug** installable on CI without Android Studio on your laptop.

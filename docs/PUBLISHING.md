# Publishing Desktop Cat on GitHub — step by step

This guide takes you from "the project is on my computer" to "anyone can download
the installer from GitHub". No command line needed: we use **GitHub Desktop**.

**Words you'll meet**

- **Git** keeps a history of every version of your files ("commits").
- **GitHub** is a website that stores that history online ("repository" or "repo") so others can see it.
- **GitHub Desktop** is a friendly app that does the Git work with buttons.
- A **Release** is a named version (like `v0.1.0`) with downloadable files attached.
- **GitHub Actions** are GitHub's own computers doing chores for you — here: building the
  Windows and Mac installers every time you publish a Release.

---

## 0. Put your name in (2 minutes)

Replace **`Your Name`** with your name (or nickname) in two files, using VS Code:

1. `LICENSE` — the line `Copyright (c) 2026 Your Name`
2. `package.json` — `"author": "Your Name"` and `"copyright": "Copyright © 2026 Your Name"`

Save both files.

## 1. Create a GitHub account

1. Go to **https://github.com/signup**.
2. Enter your email, a password and a username (it will be part of your project's address,
   e.g. `github.com/your-username/desktop-cat`).
3. Verify your email address when GitHub sends you a code.

## 2. Install GitHub Desktop and sign in

1. Download it from **https://desktop.github.com** and install it.
2. Open it and click **Sign in to GitHub.com**. Your browser opens; sign in and click
   **Authorize desktop**.
3. When asked how to "Configure Git", keep your name and email as shown and click **Finish**.

## 3. Turn the project folder into a repository

1. In GitHub Desktop: **File → Add local repository…**
2. Click **Choose…** and pick your `Documents\desktop-cat` folder.
3. GitHub Desktop says *"This directory does not appear to be a Git repository"* —
   click the blue link **create a repository** in that message.
4. In the window that opens:
   - **Name:** `desktop-cat`
   - **Description:** `A fluffy kitten that lives on your desktop`
   - **Git ignore:** leave as **None** (the project already has a `.gitignore`)
   - **License:** leave as **None** (the project already has a `LICENSE`)
5. Click **Create repository**.

The `.gitignore` file makes sure big generated folders (`node_modules`, `dist`) are **not**
uploaded — they get re-created from `package.json`.

## 4. Your first commit

A commit is a saved snapshot of your files.

1. On the left you'll see the list of files (about 25 — if you see thousands, `node_modules` is
   being included: stop and check that `.gitignore` is in the folder).
2. At the bottom left, in **Summary**, type: `First version of Desktop Cat`
3. Click **Commit to main**.

## 5. Publish it to GitHub

1. Click **Publish repository** (top bar).
2. **Untick "Keep this code private"** so others can see and download it.
3. Click **Publish repository**.
4. Click **View on GitHub** (or go to `https://github.com/your-username/desktop-cat`) — your
   README with the kitten picture is the front page.

In `README.md`, replace `YOUR-USERNAME` with your GitHub username, then commit
("Fix my username in the README") and click **Push origin** to upload the change.

## 6. Create your first Release (this builds the installers)

1. On your repository's GitHub page, click **Releases** (right-hand side) →
   **Create a new release** (or **Draft a new release**).
2. Click **Choose a tag**, type `v0.1.0`, and click **Create new tag: v0.1.0 on publish**.
3. **Release title:** `Desktop Cat 0.1.0`
4. **Description:** a few words, e.g. *"The first version! Download the .exe for Windows or
   the .dmg for your Mac (arm64 = Apple silicon, x64 = Intel)."*
5. Click **Publish release**.

## 7. Watch GitHub build it

1. Click the **Actions** tab of your repository. You'll see **Build installers** running —
   one job on Windows, one on a Mac.
2. It takes about 10 minutes. A green ✓ means it worked.
3. Go back to **Releases**: under **Assets** you now have
   - `Desktop-Cat-Setup-0.1.0.exe` (Windows)
   - `Desktop-Cat-0.1.0-mac-arm64.dmg` and `…-x64.dmg` (Mac), plus `.zip` versions

That's it — share the link to your Releases page! 🎉

> **If a job shows a red ✗:** click it, then the step with the ✗, to read what went wrong.
> You can try again with **Re-run jobs**, or run the build by hand from the Actions tab with
> **Build installers → Run workflow** (those files appear at the bottom of the run, not on a Release).

## 8. Releasing an update later

1. Change the code and test it with `npm start`.
2. In `package.json`, raise the `"version"` (e.g. `0.1.0` → `0.1.1` for fixes, `0.2.0` for new features).
3. In GitHub Desktop: write a summary → **Commit to main** → **Push origin**.
4. On GitHub: **Releases → Draft a new release**, tag `v0.1.1` (matching the version), **Publish**.
   The installers build themselves again.

## Why do people see "unknown developer" warnings?

Windows and macOS trust apps that are **code-signed** with a certificate bought from Microsoft
(~$100–400/year) or Apple (Apple Developer Program, $99/year). Desktop Cat isn't signed, so the
README explains how to open it anyway. If the app becomes popular you can add signing later —
electron-builder supports it with a few settings.

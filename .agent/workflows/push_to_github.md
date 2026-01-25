---
description: How to push changes to GitHub
---

# Push Changes to GitHub

Follow these steps to save your work and upload it to GitHub.

1.  **Check Status** (Optional but recommended)
    See which files have changed.
    ```powershell
    git status
    ```

2.  **Stage Changes**
    Prepare all modified files for commit.
    ```powershell
    git add .
    ```

3.  **Commit Changes**
    Save the changes with a descriptive message.
    ```powershell
    git commit -m "Fix missing teachers in Insights by stabilizing Firestore instance"
    ```

4.  **Push to GitHub**
    Upload your commits to the remote repository.
    ```powershell
    git push
    ```
    *Note: If this is the first time pushing this branch, you might need to run `git push -u origin main` (or `master`).*

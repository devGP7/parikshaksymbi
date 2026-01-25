---
description: How to push to a new GitHub repository
---

# Push to a New Repository

Since you don't have permission to the original repository, follow these steps to push to your own.

1.  **Create a New Repo**
    *   Go to [GitHub.com/new](https://github.com/new).
    *   Name it (e.g., `my-parikshak-ai`).
    *   **Do not** initialize with README, .gitignore, or License (keep it empty).
    *   Click "Create repository".

2.  **Remove Old Remote**
    Disconnect the project from the previous repository.
    ```powershell
    git remote remove origin
    ```

3.  **Add New Remote**
    Link your project to the new repository you just created. Replace `YOUR_USERNAME` and `REPO_NAME` with your details.
    ```powershell
    git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
    ```

4.  **Push Code**
    Upload your code.
    ```powershell
    git push -u origin main
    ```

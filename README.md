# community-notes-writer

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.2.8. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

## Community Notes API Authentication Setup (for CI and Local Use)

To submit Community Notes posts via the API, you must authenticate with a **user-context OAuth 2.0 Bearer token**. Follow these steps to set up authentication for local development and CI:

### 1. Create a Twitter/X Developer App

- Go to the [Twitter/X Developer Portal](https://developer.twitter.com/en/portal/projects-and-apps).
- Create a new app (or select your existing app).

### 2. Obtain Client ID and Client Secret

- In your app's settings, go to **Keys and tokens**.
- Copy your **Client ID** and **Client Secret**.
- Add these to your `.env.local` (or CI environment):
  ```env
  X_CLIENT_ID=your_client_id_here
  X_CLIENT_SECRET=your_client_secret_here
  ```

### 3. Set Up Redirect URI (Callback URL)

- In your app settings, add `http://localhost:8080/callback` to the list of **OAuth 2.0 Redirect URLs**.
- Save your changes.

### 4. Run the Bearer Token Script

- Run the script to generate a user-context Bearer token:
  ```sh
  bun --env-file=.env.local run src/lib/getBearerToken.ts
  ```
- The script will:
  1. Print an authorization URL. Open it in your browser and log in/authorize.
  2. Redirect you to `http://localhost:8080/callback` (the script will capture the code).
  3. Print your Bearer token in the terminal.

### 5. Set the Bearer Token in Your Environment

- Copy the Bearer token from the script output.
- Add it to your `.env.local` (or CI environment):
  ```env
  X_BEARER_TOKEN=your_bearer_token_here
  ```

### 6. Use the Bearer Token for Submitting Notes

- The submission scripts and CI jobs will use `X_BEARER_TOKEN` for authentication.
- **Do not commit your Bearer token or client secret to version control.**

---

**Summary:**

- You need: `X_CLIENT_ID`, `X_CLIENT_SECRET`, and `X_BEARER_TOKEN` in your environment.
- Update your app's callback URLs to include `http://localhost:8080/callback`.
- Use the provided script to generate a valid Bearer token for your user.
- Use this token for all Community Notes API requests in CI and locally.

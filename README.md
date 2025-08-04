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

## Community Notes API Authentication Setup

This project supports two authentication methods for submitting Community Notes:

### Method 1: OAuth 2.0 Bearer Token (User Context)

To submit Community Notes posts via the API with user context, you must authenticate with a **user-context OAuth 2.0 Bearer token**. Follow these steps:

#### 1. Create a Twitter/X Developer App

- Go to the [Twitter/X Developer Portal](https://developer.twitter.com/en/portal/projects-and-apps).
- Create a new app (or select your existing app).

#### 2. Obtain Client ID and Client Secret

- In your app's settings, go to **Keys and tokens**.
- Copy your **Client ID** and **Client Secret**.
- Add these to your `.env.local` (or CI environment):
  ```env
  X_CLIENT_ID=your_client_id_here
  X_CLIENT_SECRET=your_client_secret_here
  ```

#### 3. Set Up Redirect URI (Callback URL)

- In your app settings, add `http://localhost:8080/callback` to the list of **OAuth 2.0 Redirect URLs**.
- Save your changes.

#### 4. Run the Bearer Token Script

- Run the script to generate a user-context Bearer token:
  ```sh
  bun --env-file=.env.local run src/lib/getBearerToken.ts
  ```
- The script will:
  1. Print an authorization URL. Open it in your browser and log in/authorize.
  2. Redirect you to `http://localhost:8080/callback` (the script will capture the code).
  3. Print your Bearer token in the terminal.

#### 5. Set the Bearer Token in Your Environment

- Copy the Bearer token from the script output.
- Add it to your `.env.local` (or CI environment):
  ```env
  X_BEARER_TOKEN=your_bearer_token_here
  ```

### Method 2: OAuth 1.0a (App Context)

For app-level authentication using OAuth 1.0a, you need API keys and access tokens:

#### 1. Get OAuth 1.0a Credentials

- In your Twitter/X Developer App settings, go to **Keys and tokens**.
- Copy your **API Key** and **API Key Secret**.
- Generate **Access Token and Secret** (if not already done).
- Add these to your `.env.local`:
  ```env
  X_API_KEY=your_api_key_here
  X_API_KEY_SECRET=your_api_key_secret_here
  X_ACCESS_TOKEN=your_access_token_here
  X_ACCESS_TOKEN_SECRET=your_access_token_secret_here
  ```

#### 2. Use OAuth 1.0a for API Calls

The OAuth 1.0a implementation is in `src/lib/submitNoteOAuth1.ts` and automatically handles:

- OAuth1 signature generation
- Request authentication
- API communication

### Usage

- **OAuth 2.0**: Use `submitNote()` function for user-context requests
- **OAuth 1.0a**: Use `submitNoteOAuth1()` function for app-context requests

### Security Notes

- **Do not commit your tokens or secrets to version control.**
- Use environment variables for all sensitive credentials.
- The OAuth1 implementation has been tested and verified to work with Twitter's API.

---

**Summary:**

- **OAuth 2.0**: Requires `X_CLIENT_ID`, `X_CLIENT_SECRET`, and `X_BEARER_TOKEN`
- **OAuth 1.0a**: Requires `X_API_KEY`, `X_API_KEY_SECRET`, `X_ACCESS_TOKEN`, and `X_ACCESS_TOKEN_SECRET`
- Both methods are fully functional and tested
- Use environment variables for all credentials

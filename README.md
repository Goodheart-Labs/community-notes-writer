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

This project uses OAuth 1.0a authentication for submitting Community Notes to Twitter/X API.

### OAuth 1.0a Setup

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

The OAuth 1.0a implementation is in `src/lib/submitNote.ts` and automatically handles:

- OAuth1 signature generation
- Request authentication
- API communication

### Usage

- Use `submitNote()` function for submitting Community Notes
- Use `fetchEligiblePosts()` function for fetching posts eligible for notes

### Security Notes

- **Do not commit your tokens or secrets to version control.**
- Use environment variables for all sensitive credentials.
- The OAuth1 implementation has been tested and verified to work with Twitter's API.

---

**Summary:**

- **OAuth 1.0a**: Requires `X_API_KEY`, `X_API_KEY_SECRET`, `X_ACCESS_TOKEN`, and `X_ACCESS_TOKEN_SECRET`
- Fully functional and tested
- Use environment variables for all credentials
